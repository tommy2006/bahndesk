// The dispatch-risk agent: a language model in a tool loop. Claude (Anthropic API) when
// ANTHROPIC_API_KEY is set, otherwise Groq (OpenAI-compatible API) when GROQ_API_KEY is set.
// It does the cheap work first (read, look up, ask the driver or site), then either
// resolves the order on its own (only when nothing needs a person) or hands a person
// one proposal. It never contacts a customer and never changes a booking, date or
// cost without approval.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, rowsFor, SNAPSHOT_AT } from './data.mjs';
import { analyseOrder, rankDrivers } from './engine.mjs';
import { driverRecord, ferrySchedule, strikes, coordsOf, nextSailings } from './external.mjs';
import { live, kmFromSegment, weatherLabel } from './live.mjs';

const STORE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'runs.json');
export const runs = (() => { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; } })();
const persist = () => { try { fs.writeFileSync(STORE, JSON.stringify(runs, null, 1)); } catch {} };

let usingFallback = false;
const MODEL = () => (usingFallback ? process.env.GROQ_FALLBACK_MODEL || 'openai/gpt-oss-20b' : process.env.GROQ_MODEL || 'openai/gpt-oss-120b');
export const activeModel = () => MODEL();

// Tools speak Helsinki local time (as ops people do), never raw UTC.
const local = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Helsinki', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : iso;
const localTimes = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v) ? local(v)
  : Array.isArray(v) ? v.map(localTimes) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, localTimes(x)])) : v;
export const provider = () => (process.env.ANTHROPIC_API_KEY ? 'claude' : process.env.GROQ_API_KEY ? 'groq' : null);
export const agentAvailable = () => Boolean(provider());
export const agentModel = () => (provider() === 'claude' ? CLAUDE_MODEL() : MODEL());

// ---------- Claude (official Anthropic SDK) ----------
const CLAUDE_MODEL = () => process.env.CLAUDE_MODEL || 'claude-opus-5-5';
let anthropic;
async function claude(params) {
  if (!anthropic) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY; retries 429/5xx itself
  }
  // A safety decline is re-run on Anthropic's recommended fallback model server-side.
  return anthropic.beta.messages.create({
    model: CLAUDE_MODEL(), max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    ...params,
  });
}
// Translate a batch of English UI/record strings to Finnish (used by lib/i18n.mjs).
export async function translateStrings(list) {
  if (provider() !== 'claude') throw new Error('Finnish translation needs ANTHROPIC_API_KEY');
  const res = await claude({
    output_config: { effort: 'low' },
    system: 'You translate interface and record text for a car-delivery operations tool from English into natural, concise Finnish. Keep names of people, companies, ships and places, order references (CD-...), numbers, prices, dates and times unchanged. Reply with a JSON array of strings only, the same length and order as the input.',
    messages: [{ role: 'user', content: JSON.stringify(list) }],
  });
  const text = claudeText(res);
  const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
  if (!Array.isArray(arr) || arr.length !== list.length) throw new Error('translation came back with the wrong length');
  return arr;
}

const claudeText = (res) => res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

const SYSTEM = `You are Bahn's dispatch-risk agent. Bahn delivers used cars for dealers with freelance drivers.
You work on ONE order. Your job: find out what is really going on, cheaply, and either settle it or bring a person ONE clear decision.

Rules:
- Do the cheap work first: get_order_overview, then only the lookups you need. Ask the driver or pickup site when facts are missing.
- Never contact a customer (anyone who pays Bahn: dealers, buyers). If a customer must be told something, put it in the proposal for a person.
- Never change a booking, date, cost or driver yourself. Use propose_decision; a person approves it.
- Use resolve_without_person ONLY if nothing needs a human judgement (e.g. the driver confirmed position, weather briefing sent).
- Treat alerts as signals, quotes as not booked, and driver messages as claims, not verified facts. Say which source each fact came from.
- Be brief. Ops people read your output in seconds. Stop after at most 6 tool calls and decide.
- Write the proposal in plain language: what happened, what you found, what you suggest, and what happens if approved.
- Name sources the way an ops person would, e.g. (ferry quote, 21 Oct 10:00) or (driver's reply). Never write tool names.
- Plain text only: no Markdown, no asterisks, ordinary spaces and hyphens.
What Bahn told us matters (25 Oct 2026):
- The worst failure is a car we could deliver but don't. A driver who picked up a car and then goes quiet is the top concern: ask the driver first, then bring a person a plan.
- GPS often drops out in the German countryside. A tracking gap alone is not alarming if the driver has been in touch.
- The latest arrival time is soft. Prefer speed, and say whether this customer has had late deliveries before; repeated lateness is what loses trust.
- Every driver is trained for every car, and Bahn rarely moves cars over €100k. Never propose a driver change because of the car's value; only for availability, location or a real track-record problem.
- Travemünde is a known trouble spot, and winter tyres matter once winter starts. Bahn has no data on EV range in winter, so call range figures estimates.
- If the pickup site cannot find or release the right car, finding it can take days. Do not only propose waiting: say how long waiting is reasonable, and weigh releasing the driver, giving the driver another nearby job, or cancelling the delivery.
- All times you see are Helsinki local time (Tallinn is the same). Write them that way, e.g. "Wed 15:30". Never convert to UTC.`;

const TOOLS = [
  fn('get_order_overview', 'Risk analysis of the order: confidence, reasons with sources, route, car, driver, schedule (ETA, latest arrival, prediction).', {}),
  fn('get_messages', 'The latest messages on this order (driver, site, customer, operators).', {}),
  fn('get_driver_record', 'Track record of the assigned driver.', {}),
  fn('get_live_conditions', 'Live weather (Open-Meteo) and Fintraffic road announcements along the Finnish part of the route, plus EV range/charging.', {}),
  fn('check_ferry_options', 'Booked ferry, quoted/sold-out options, the real Helsinki–Tallinn sailings from now, and any strike notices.', {}),
  fn('find_alternative_drivers', 'Rank other Finnish and Estonian drivers for this order by distance, track record and fit to the car.', {}),
  fn('ask_driver', 'Send the assigned driver a question in the driver app and get their reply. Allowed without approval.', { question: { type: 'string' } }, ['question']),
  fn('contact_pickup_site', 'Ask the pickup site/yard a question and get their reply. Allowed without approval. Not for customers.', { question: { type: 'string' } }, ['question']),
  fn('propose_decision', 'Hand a person one decision. Ends your turn.', {
    what_happened: { type: 'string', description: 'One or two sentences.' },
    what_i_found: { type: 'array', items: { type: 'string' }, description: 'Facts, each with its source in brackets.' },
    suggestion: { type: 'string', description: 'The one action you recommend.' },
    if_approved: { type: 'string', description: 'What you will do next if the person approves.' },
    changes: { type: 'array', items: { type: 'string' }, description: 'Bookings, dates, costs or drivers that would change.' },
    cost_eur: { type: ['number', 'null'] },
    customer_must_be_told: { type: ['boolean', 'null'] },
  }, ['what_happened', 'what_i_found', 'suggestion', 'if_approved']),
  fn('resolve_without_person', 'Close your work on this order because nothing needs a person. Ends your turn.', { note: { type: 'string' } }, ['note']),
];

function fn(name, description, properties, required = []) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

function compactOverview(a) {
  return {
    ref: a.ref, status: a.status, lane: a.lane, confidence: a.confidence, car: a.vehicle,
    from: a.from, to: a.to, drive_km: a.driveKm, ferry: a.ferry, pickup_slot: a.pickupSlot,
    customer_eta: a.eta, latest_arrival: a.lta, predicted_arrival: a.predicted, buffer_hours: a.slackH && +a.slackH.toFixed(1),
    driver: a.driver && { id: a.driver.id, name: a.driver.name }, driver_fee_eur: a.fee && a.fee / 100,
    reasons: a.reasons.map((r) => ({ factor: r.factor, risk: r.r, text: r.text.en, agent_can_handle: r.agentCan, source: `${r.source.label}${r.source.at ? ` @ ${r.source.at}` : ''}` })),
  };
}

// Simulated driver and site replies, consistent with the order's records.
function simulatedReply(who, orderId, question) {
  const a = analyseOrder(db.orders[orderId]);
  const q = question.toLowerCase();
  // Ground replies in what this person last wrote in the snapshot, so the simulation
  // does not invent facts that steer the agent.
  const lastFrom = (type) => rowsFor('messages', orderId).filter((m) => m.author_type === type).sort((x, y) => x.authored_at.localeCompare(y.authored_at)).at(-1);
  if (who === 'driver') {
    if (!a.driver) return { reply: null, note: 'No driver is assigned to this order. Do not ask the driver again.' };
    // A driver who has gone quiet stays quiet in the simulation too.
    if (a.reasons.some((r) => r.kind === 'silent' || r.kind === 'silent_check')) return { reply: null, note: 'Message delivered to the driver app; no reply.' };
    const inc = rowsFor('incidents', orderId).find((i) => !i.resolved_at);
    const travelProblem = a.reasons.some((r) => r.kind === 'ferry_sold_out') || inc?.kind === 'TRAVEL_CAPACITY';
    if (inc?.kind === 'VEHICLE_WARNING') return { reply: 'Yes I am safe, parked at the service area car park. Red light still on, sending photo now. Car does not want to accelerate.' };
    if (/where|location|position|sijainti/.test(q)) return { reply: a.status === 'IN_TRANSIT' ? `On the way, about ${Math.max(20, Math.round(a.driveKm * 0.4))} km left. App lost signal for a while, sorry.` : 'Not started yet, I will leave in time for the pickup slot.' };
    if (/ferry|lautta|check-?in/.test(q)) return { reply: a.ferry ? `I have the booking ${a.ferry.ref}. Will be at the terminal before check-in closes.` : 'I don’t have any ferry booking yet. Which one should I take?' };
    if (/hotel|night|overnight/.test(q) && travelProblem) return { reply: 'I can stay one more night if Bahn pays the hotel. Next day is fine for me.' };
    if (/charg|lataus/.test(q)) return { reply: 'Thanks, I will use the chargers you sent.' };
    const last = lastFrom('driver');
    return { reply: last ? `Nothing new since my last message (${local(last.authored_at)}): “${last.body.slice(0, 200)}”` : 'Ok, understood. Nothing new from my side.' };
  }
  const ep = rowsFor('order_endpoint_details', orderId).find((e) => e.boundary === 'PICKUP');
  const lastSite = lastFrom('site_contact');
  if (lastSite) return { reply: `No update yet beyond our last message (${local(lastSite.authored_at)}): “${lastSite.body.slice(0, 200)}”` };
  if (/key|avain/.test(q)) return { reply: ep?.access_status === 'CONFIRMED' ? 'Keys are at the desk, driver should ask for the order reference.' : 'I need to check with stock control who has the keys. I will call back within the hour.' };
  return { reply: 'We received your question and will confirm before the pickup slot.' };
}

function runTool(name, args, orderId) {
  const order = db.orders[orderId];
  const a = analyseOrder(order);
  switch (name) {
    case 'get_order_overview': return compactOverview(a);
    case 'get_messages': return rowsFor('messages', orderId).sort((x, y) => x.authored_at.localeCompare(y.authored_at)).slice(-6)
      .map((m) => ({ at: m.authored_at, from: m.author_type, body: m.body.slice(0, 280) }));
    case 'get_driver_record': return a.driver ? driverRecord(a.driver.id) : { note: 'No driver assigned.' };
    case 'get_live_conditions': {
      const fiStart = a.from.country === 'FI' ? a.from.city : 'Helsinki';
      const cities = [...new Set([fiStart, a.to.city])];
      const A = coordsOf(fiStart), B = coordsOf(a.to.city);
      return {
        fetched_at: live.weatherAt, status: live.status,
        weather: Object.fromEntries(cities.map((c) => [c, live.weather[c] && { ...live.weather[c], label: weatherLabel(live.weather[c].code) }])),
        road_announcements_near_route: A && B ? live.traffic.filter((t) => kmFromSegment([t.lat, t.lon], A, B) < 4).map((t) => ({ type: t.type, title: t.title, at: t.at })) : [],
        energy: a.energy,
        finnish_route: a.fiRoute && { km: a.fiRoute.km, drive_minutes: a.fiRoute.minutes, stops: a.fiRoute.stops, suggested_chargers: a.fiRoute.suggestedChargers, rest_areas: a.fiRoute.restAreas },
      };
    }
    case 'check_ferry_options': return {
      booked: rowsFor('travel_reservations', orderId).filter((r) => r.kind === 'FERRY').map((r) => ({ status: r.status, provider: r.provider, departs: r.departure_at, arrives: r.expected_arrival_at, check_in: r.check_in_confirmation, terminal: r.destination_terminal_id })),
      // `kind` matters: a TRAIN quote is driver positioning, not a vehicle crossing.
      options_checked: rowsFor('travel_options', orderId).map((t) => ({ kind: t.kind, from: t.from_city, to: t.to_city, status: t.status, provider: t.provider, departs: t.departure_at, arrives: t.arrival_at, price_eur: t.quote_cents && t.quote_cents / 100, checked_at: t.checked_at, note: t.capacity_note })),
      // Real published Helsinki–Tallinn sailings from now (check-in 45 min before departure).
      next_real_gulf_sailings: a.gulf ? nextSailings(a.gulf, SNAPSHOT_AT, 5).map((s) => `${s.operator} ${s.ship}: departs ${local(s.dep)}, arrives ${local(s.arr)}, check-in by ${local(s.checkIn)}, ${s.fromTerminal} → ${s.toTerminal}, ~€${s.eur} indicative`) : undefined,
      timetable: ferrySchedule().routes.map((r) => `${r.operator}: ${r.from} → ${r.to}, daily ${r.departs_local.join('/')}, ${r.hours} h, €${r.vehicle_price_eur}${r.note ? ` (${r.note})` : ''}`),
      strike_notices: strikes().filter((s) => s.terminal_id).map((s) => ({ title: s.title.en, starts: s.starts_at, ends: s.ends_at, status: s.status })),
    };
    case 'find_alternative_drivers': return rankDrivers(orderId, 3);
    case 'ask_driver': return simulatedReply('driver', orderId, args.question || '');
    case 'contact_pickup_site': return simulatedReply('site', orderId, args.question || '');
    default: return { error: `Unknown tool ${name}` };
  }
}

// Finnish version of a proposal for the Finnish UI: one plain call, no tools.
const FI_FIELDS = ['what_happened', 'what_i_found', 'suggestion', 'if_approved', 'note'];
export async function translateOutcome(outcome) {
  if (!outcome || outcome.fi) return outcome;
  const src = Object.fromEntries(FI_FIELDS.filter((k) => outcome[k]).map((k) => [k, outcome[k]]));
  if (provider() === 'claude') {
    const res = await claude({
      output_config: { effort: 'low' },
      system: 'Translate the JSON values into clear, natural Finnish for a car-logistics operations team. Keep the same keys and array lengths. Keep names, ship names, prices, times and order references unchanged. Reply with the JSON object only.',
      messages: [{ role: 'user', content: JSON.stringify(src) }],
    });
    const text = claudeText(res);
    outcome.fi = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return outcome;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL(), temperature: 0, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Translate the JSON values into clear, natural Finnish for a car-logistics operations team. Keep the same keys and array lengths. Keep names, ship names, prices, times and order references unchanged. Return JSON only.' },
        { role: 'user', content: JSON.stringify(src) },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (res.ok) {
    outcome.fi = JSON.parse((await res.json()).choices[0].message.content);
    return outcome;
  }
  const text = await res.text();
  if (res.status === 429 && /tokens per day/.test(text) && !usingFallback) { usingFallback = true; continue; }
  if (res.status === 429) { await new Promise((r) => setTimeout(r, (Number(text.match(/try again in ([\d.]+)s/)?.[1] || 10) + 1) * 1000)); continue; }
  throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
  }
  throw new Error('Translation kept hitting the rate limit');
}

const FINAL_TOOLS = TOOLS.filter((t) => ['propose_decision', 'resolve_without_person'].includes(t.function.name));

// Groq's free tier allows few tokens per minute: on 429 wait as told and retry.
// gpt-oss sometimes emits a malformed tool call (400 tool_use_failed): retry that too.
// `final` offers only the hand-over tools, so the model has to decide.
async function chat(messages, final = false) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL(), messages, tools: final ? FINAL_TOOLS : TOOLS, tool_choice: final ? 'required' : 'auto', temperature: 0.2 }),
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      // Dropped connection or timeout: retry a few times.
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (res.ok) return (await res.json()).choices[0].message;
    const text = await res.text();
    // Daily cap on the main model: switch to the fallback model, which has its own quota.
    if (res.status === 429 && /tokens per day/.test(text) && !usingFallback) { usingFallback = true; attempt--; continue; }
    const retryable = res.status === 429 || (res.status === 400 && text.includes('tool_use_failed'));
    if (!retryable || attempt >= 6) throw new Error(`Groq ${res.status}: ${text.slice(0, 300)}`);
    const wait = res.status === 429 ? Number(text.match(/try again in ([\d.]+)s/)?.[1] || 10) + 1 : 1;
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

const busy = new Set();

// Run (or continue) the agent on an order. `userMessage` is a person talking to it.
export async function runAgent(orderId, userMessage = null) {
  if (!agentAvailable()) throw new Error('Add ANTHROPIC_API_KEY (or GROQ_API_KEY) to .env to run the agent.');
  if (busy.has(orderId)) throw new Error('The agent is already working on this order.');
  busy.add(orderId);
  const run = runs[orderId] ||= { orderId, messages: [{ role: 'system', content: SYSTEM }], steps: [], outcome: null };
  const ask = userMessage || `Work on order ${db.orders[orderId].reference} (${orderId}). Start with get_order_overview.`;
  try {
    if (userMessage) run.steps.push({ type: 'person', text: userMessage, at: new Date().toISOString() });
    // A question from a person keeps the pending proposal; a new proposal or resolution replaces it.
    else run.outcome = null;
    const seen = new Set(run.steps.filter((s) => s.type === 'tool').map((s) => s.name + JSON.stringify(s.args)));
    if (provider() === 'claude') await runClaude(run, orderId, ask, Boolean(userMessage), seen);
    else await runGroq(run, orderId, ask, Boolean(userMessage), seen);
    // Best effort: a missing translation falls back to English in the UI.
    if (run.outcome && !run.outcome.fi) await translateOutcome(run.outcome).catch(() => {});
    persist();
    return publicRun(run);
  } catch (e) {
    // A run that failed before doing anything should not block a retry.
    if (!run.steps.length) delete runs[orderId];
    persist();
    throw e;
  } finally {
    busy.delete(orderId);
  }
}

// One tool call, shared by both providers. Ends the turn on a proposal or resolution.
function handleCall(run, orderId, name, args, seen) {
  let result, ended = false, lookup = false;
  if (name === 'propose_decision') {
    run.outcome = { type: 'proposal', ...args, status: 'PENDING_APPROVAL', at: new Date().toISOString(), model: agentModel() };
    result = { ok: true, note: 'Sent to a person for approval.' };
    ended = true;
  } else if (name === 'resolve_without_person') {
    const human = analyseOrder(db.orders[orderId]).reasons.filter((r) => !r.agentCan && !r.group);
    if (human.length) result = { ok: false, error: 'Not allowed: this order has issues that need a person. Use propose_decision.' };
    else { run.outcome = { type: 'resolved', note: args.note, at: new Date().toISOString(), model: agentModel() }; result = { ok: true }; ended = true; }
  } else if (seen.has(name + JSON.stringify(args))) {
    result = { note: 'You already did this and have the answer above. Use what you have and decide.' };
  } else {
    seen.add(name + JSON.stringify(args));
    result = runTool(name, args, orderId);
    lookup = true;
  }
  run.steps.push({ type: 'tool', name, args, summary: summarise(name, result), at: new Date().toISOString() });
  return { result, ended, lookup };
}

const CLAUDE_TOOLS = TOOLS.map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));

// Claude: manual tool loop. History is append-only: each response's full content
// (thinking blocks included) goes back unchanged. Forced tool_choice is not allowed
// on this model, so after enough lookups a text note asks it to decide.
async function runClaude(run, orderId, ask, personAsked, seen) {
  if (!run.claude) {
    run.claude = [];
    // Earlier work by another model on this order: pass the facts on as text.
    if (run.steps.length) {
      const earlier = run.steps.filter((s) => s.type !== 'person').map((s) => `- ${s.type === 'tool' ? `${s.name}${s.args?.question ? ` "${s.args.question}"` : ''}: ${s.summary}` : s.text}`).join('\n');
      run.claude.push({ role: 'user', content: `Earlier agent work on this order:\n${earlier}${run.outcome?.suggestion ? `\nPending suggestion: ${run.outcome.suggestion}` : ''}` });
    }
  }
  run.claude.push({ role: 'user', content: ask });
  let lookups = 0;
  for (let i = 0; i < 12; i++) {
    const res = await claude({ system: SYSTEM, tools: CLAUDE_TOOLS, messages: run.claude, output_config: { effort: 'medium' } });
    if (res.stop_reason === 'refusal') throw new Error('Claude declined this request.');
    run.claude.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'pause_turn') continue;
    const uses = res.content.filter((b) => b.type === 'tool_use');
    if (!uses.length) {
      // A plain reply is fine when a person asked something; otherwise it must decide via a tool.
      if (personAsked) { run.steps.push({ type: 'say', text: claudeText(res), at: new Date().toISOString() }); return; }
      run.claude.push({ role: 'user', content: 'Do not answer in plain text. Call propose_decision now, or resolve_without_person if nothing needs a person.' });
      continue;
    }
    const results = [];
    let ended = false;
    for (const u of uses) {
      const r = handleCall(run, orderId, u.name, u.input || {}, seen);
      if (r.lookup) lookups++;
      if (r.ended) ended = true;
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(localTimes(r.result)).slice(0, 4000), ...(r.result?.ok === false ? { is_error: true } : {}) });
    }
    // All results go back in one message; a nudge rides along once the legwork is done.
    if (!ended && lookups >= 6) results.push({ type: 'text', text: 'You have done enough lookups. Call propose_decision now, or resolve_without_person if nothing needs a person.' });
    run.claude.push({ role: 'user', content: results });
    if (ended) return;
  }
}

async function runGroq(run, orderId, ask, personAsked, seen) {
  const userMessage = personAsked ? ask : null;
  run.messages.push({ role: 'user', content: ask });
  {
    let lookups = 0;
    for (let i = 0; i < 10; i++) {
      // Enough legwork: after 6 lookups (or on the last turn) it must hand over a decision.
      const force = lookups >= 6 || i === 9;
      const msg = await chat(run.messages, force);
      run.messages.push({ role: 'assistant', content: msg.content || '', ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) });
      if (!msg.tool_calls?.length) {
        // A plain reply is fine when a person asked something; otherwise it must decide via a tool.
        if (userMessage) { run.steps.push({ type: 'say', text: msg.content, at: new Date().toISOString() }); break; }
        run.messages.push({ role: 'user', content: 'Do not answer in plain text. Call propose_decision now, or resolve_without_person if nothing needs a person.' });
        lookups = 6; // next turn offers only the hand-over tools
        continue;
      }
      let ended = false;
      for (const call of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
        const r = handleCall(run, orderId, call.function.name, args, seen);
        if (r.lookup) lookups++;
        if (r.ended) ended = true;
        run.messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(localTimes(r.result)).slice(0, 2500) });
      }
      if (ended) break;
    }
  }
}

function summarise(name, r) {
  if (r?.note && !r.reply) return r.note;
  if (name === 'ask_driver' || name === 'contact_pickup_site') return r.reply ? `“${r.reply}”` : r.note;
  if (name === 'get_order_overview') return `Confidence ${r.confidence} %, ${r.reasons.length} signal(s)`;
  if (name === 'find_alternative_drivers') return r.map((d) => `${d.name} (${d.score})`).join(', ');
  if (name === 'get_messages') return `${r.length} message(s) read`;
  if (name === 'check_ferry_options') return `${r.booked.length} booked, ${r.options_checked.length} option(s), ${r.strike_notices.length} strike notice(s)`;
  if (name === 'get_live_conditions') return Object.entries(r.weather).map(([c, w]) => w ? `${c} ${Math.round(w.tempC)} °C ${w.label}` : c).join(' · ');
  if (r?.error) return r.error;
  return 'Done';
}

export function publicRun(run) {
  if (!run) return null;
  return { orderId: run.orderId, steps: run.steps, outcome: run.outcome, busy: busy.has(run.orderId) };
}

export function decideOutcome(orderId, choice, note) {
  const run = runs[orderId];
  if (run?.outcome?.type === 'proposal') {
    // No choice = undo: the suggestion is pending again.
    run.outcome.status = !choice ? 'PENDING_APPROVAL' : choice === 'approve' ? 'APPROVED' : 'CHANGED';
    run.outcome.decidedNote = note || null;
    persist();
  }
}
