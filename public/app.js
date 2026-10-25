// Bahn Control Room front end. Plain JS, no build step.
const T = {
  en: {
    product: 'Control room', needs_you: 'Needs you', agent: 'Agent handling', clear: 'On track', done: 'Delivered',
    title_needs: '{n} orders need you', title_needs_one: '1 order needs you', title_agent: 'Agent is handling {n}', title_clear: '{n} on track', title_done: '{n} delivered',
    sub_needs: 'Most urgent first. The agent did the legwork; each one needs your call.', sub_agent: 'The agent is on these and will bring you anything it cannot settle.', sub_clear: 'Nothing to do. Shown for reference.', sub_done: 'Handed over.',
    orders_as_of: 'Orders as of', live: 'Weather & roads live, updated {t}', offline: 'Weather & roads offline, last saved {t}',
    empty_needs: 'Nothing needs you right now', empty_needs_sub: 'The agent is handling {n} orders and will bring you anything it cannot settle.',
    empty_other: 'No orders here', pick: 'Pick an order', pick_sub: 'Orders that need a decision are on the left. Everything else is handled or on track.',
    from: 'From', to: 'To', why_you: 'Why you need to look', decision: 'Your decision', agent_suggests: 'Agent suggests', what_next: 'If you approve:',
    why_more: 'Everything else on this order', why_watch: 'What the agent is watching', superseded: 'Earlier suggestion, replaced by the one above',
    confidence: 'Confidence', conf_sub: 'that this delivers on time without a person',
    times: 'Arrival', eta_orig: "Customer's ETA (original)", lta: 'Latest acceptable', if_nothing: 'If nothing is done', if_approve: 'If you approve (new ETA)', predicted: 'Predicted arrival',
    unknown: 'Unknown', late_by: 'late {h}', on_time: 'in time', vs_orig: '{d} vs original',
    conditions: 'Route & road', leg_ee: 'Estonia', leg_fi: 'Finland', ferry: 'Ferry', booked: 'Booked', not_booked: 'Not booked yet', harbour: 'harbour', timetable: 'published timetable',
    along: 'Along the route', fuel: 'fuel', fast: 'fast chargers', rest: 'rest areas', energy: 'Energy, whole trip', stops: '{n} charging stop(s), {km} km per charge', fuel_ok: 'No fuel stop needed', fuel_stops: '{n} fuel stop(s)', charge_at: 'Charge at',
    live_h: 'Weather and roads now', no_warn: 'No weather or road warnings on this route.', ee_roads: 'Estonian road notices are not connected yet (Tark Tee needs an API key). Weather is live.',
    driver: 'Driver', no_driver: 'No driver yet', on_time_rate: 'On time', deliveries: 'Deliveries (12 mo)', claims: 'Damage claims (12 mo)', demo: 'demo history',
    better: 'Better-matched drivers', offer_to: 'Offer job',
    agent_title: 'What the agent did', run_agent: 'Let the agent look into it', agent_off: 'The agent is off. Add ANTHROPIC_API_KEY to .env and restart.', working: 'The agent is working…', ask_ph: 'Ask the agent or tell it what to do instead…', send: 'Send', you: 'You',
    timeline: 'What happened', show_all: 'Show all {n}', show_less: 'Show less', decided: 'Decided', decided_note: 'Decided at {time}: {choice}.', approved: 'Approved', changed: 'Changed', other_options: 'Other options', tech_details: 'Show technical details', map_label: 'Route map', sec_evidence: 'Evidence and sources ({n})', agent_found: 'What the agent found', sec_arrival: 'Confidence {c}% and arrival times', sec_route: 'Route, stops and road conditions', sec_agent: 'What the agent did ({n} steps)', sec_driver: 'Driver: {name}', sec_history: 'History ({n})', overdue: 'Overdue {t}', left: '{t} left', if_approve_short: 'If you approve', lg_clear: 'Clear road', lg_risk: 'Risk', lg_warn: 'Caution', lg_good: 'Opportunity', lg_ferry: 'Ferry', urgent_first: 'Most urgent first.', next_up: 'Do this now', demo_data: 'demo data', live_tag: 'live', yrs: 'yrs', agent_label: 'Agent', who: { operator: 'Operator', driver: 'Driver', customer: 'Customer', agent: 'Agent', system: 'System', person: 'You', site_contact: 'Site', handoff_contact: 'Handover contact' },
    undo: 'Undo', source: 'Source', close: 'Close', factor: { readiness: 'Readiness', schedule: 'Schedule', route: 'Route', car: 'Car', driver: 'Driver', market: 'Driver market', external: 'News' },
    group_affects: 'Affects {n} cars', group_decided: 'Decided: {choice}. The agent is carrying it out on each car.', reroute: 'Rebook all', keep_warn: 'Keep and warn dealers',
    nothing: 'No open signals.', resolved: 'The agent settled this without a person.', change_ph: 'What should happen instead?', confirm_change: 'Send to agent', approve: 'Approve', change: 'Change',
    customer_draft: 'A customer message is drafted for you to send.',
    kind: { DEALERSHIP: 'Dealership', SOURCE_DEALER: 'Selling dealer', PRIVATE_HOME: 'Private seller', TRANSFER_YARD: 'Transfer yard', INDEPENDENT_STORAGE: 'Storage yard', THIRD_PARTY_BUSINESS: 'Business' },
    country: { FI: 'Finland', EE: 'Estonia' },
    step: { get_order_overview: 'Checked the order', get_messages: 'Read the messages', get_driver_record: "Checked the driver's record", get_live_conditions: 'Checked weather and roads', check_ferry_options: 'Checked ferries', find_alternative_drivers: 'Ranked other drivers', ask_driver: 'Asked the driver', contact_pickup_site: 'Asked the pickup site', propose_decision: 'Sent you a suggestion', resolve_without_person: 'Closed it without you' },
  },
  fi: {
    product: 'Ohjaamo', needs_you: 'Tarvitsee sinua', agent: 'Agentti hoitaa', clear: 'Aikataulussa', done: 'Toimitettu',
    title_needs: '{n} tilausta tarvitsee sinua', title_needs_one: '1 tilaus tarvitsee sinua', title_agent: 'Agentti hoitaa {n}', title_clear: '{n} aikataulussa', title_done: '{n} toimitettu',
    sub_needs: 'Kiireellisin ensin. Agentti teki selvitystyön; jokainen vaatii päätöksesi.', sub_agent: 'Agentti hoitaa nämä ja tuo sinulle vain sen, mitä se ei voi ratkaista.', sub_clear: 'Ei tehtävää. Näytetään tiedoksi.', sub_done: 'Luovutettu.',
    orders_as_of: 'Tilaukset hetkellä', live: 'Sää ja tiet reaaliajassa, päivitetty {t}', offline: 'Sää ja tiet eivät päivity, viimeksi tallennettu {t}',
    empty_needs: 'Mikään ei tarvitse sinua juuri nyt', empty_needs_sub: 'Agentti hoitaa {n} tilausta ja tuo sinulle vain sen, mitä se ei voi ratkaista.',
    empty_other: 'Ei tilauksia', pick: 'Valitse tilaus', pick_sub: 'Päätöstä vaativat tilaukset ovat vasemmalla. Kaikki muu on hoidossa.',
    from: 'Mistä', to: 'Minne', why_you: 'Miksi sinun pitää katsoa', decision: 'Päätöksesi', agent_suggests: 'Agentti ehdottaa', what_next: 'Jos hyväksyt:',
    why_more: 'Muut asiat tilauksella', why_watch: 'Mitä agentti seuraa', superseded: 'Aiempi ehdotus, korvattu yllä olevalla',
    confidence: 'Luottamus', conf_sub: 'että toimitus onnistuu ajallaan ilman ihmistä',
    times: 'Saapuminen', eta_orig: 'Asiakkaan toive (alkuperäinen)', lta: 'Viimeistään', if_nothing: 'Jos mitään ei tehdä', if_approve: 'Jos hyväksyt (uusi arvio)', predicted: 'Ennuste',
    unknown: 'Tuntematon', late_by: 'myöhässä {h}', on_time: 'ajallaan', vs_orig: '{d} alkuperäiseen',
    conditions: 'Reitti ja tiet', leg_ee: 'Viro', leg_fi: 'Suomi', ferry: 'Lautta', booked: 'Varattu', not_booked: 'Ei vielä varattu', harbour: 'satama', timetable: 'julkaistu aikataulu',
    along: 'Reitin varrella', fuel: 'asemaa', fast: 'pikalaturia', rest: 'levähdyspaikkaa', energy: 'Energia, koko matka', stops: '{n} latausta, {km} km / lataus', fuel_ok: 'Ei tankkausta', fuel_stops: '{n} tankkausta', charge_at: 'Lataa',
    live_h: 'Sää ja tiet nyt', no_warn: 'Ei sää- tai tievaroituksia reitillä.', ee_roads: 'Viron tiedotteita ei ole vielä kytketty (Tark Tee vaatii API-avaimen). Sää on reaaliaikainen.',
    driver: 'Kuljettaja', no_driver: 'Ei vielä kuljettajaa', on_time_rate: 'Ajallaan', deliveries: 'Toimituksia (12 kk)', claims: 'Vahinkoja (12 kk)', demo: 'demohistoria',
    better: 'Paremmin sopivat kuljettajat', offer_to: 'Tarjoa',
    agent_title: 'Mitä agentti teki', run_agent: 'Anna agentin selvittää', agent_off: 'Agentti ei ole päällä. Lisää ANTHROPIC_API_KEY .env-tiedostoon.', working: 'Agentti työskentelee…', ask_ph: 'Kysy agentilta tai kerro mitä tehdä…', send: 'Lähetä', you: 'Sinä',
    timeline: 'Tapahtumat', show_all: 'Näytä kaikki {n}', show_less: 'Näytä vähemmän', decided: 'Päätetty', decided_note: 'Päätetty klo {time}: {choice}.', approved: 'Hyväksytty', changed: 'Muutettu', other_options: 'Muut vaihtoehdot', tech_details: 'Näytä tekniset tiedot', map_label: 'Reittikartta', sec_evidence: 'Näytöt ja lähteet ({n})', agent_found: 'Mitä agentti löysi', sec_arrival: 'Luottamus {c} % ja saapumisajat', sec_route: 'Reitti, pysähdykset ja tieolosuhteet', sec_agent: 'Mitä agentti teki ({n} vaihetta)', sec_driver: 'Kuljettaja: {name}', sec_history: 'Tapahtumat ({n})', overdue: 'Myöhässä {t}', left: '{t} jäljellä', if_approve_short: 'Jos hyväksyt', lg_clear: 'Tie vapaa', lg_risk: 'Riski', lg_warn: 'Varoitus', lg_good: 'Mahdollisuus', lg_ferry: 'Lautta', urgent_first: 'Kiireellisin ensin.', next_up: 'Tee tämä nyt', demo_data: 'demodata', live_tag: 'reaaliaikainen', yrs: 'v', agent_label: 'Agentti', who: { operator: 'Operaattori', driver: 'Kuljettaja', customer: 'Asiakas', agent: 'Agentti', system: 'Järjestelmä', person: 'Sinä', site_contact: 'Noutopaikka', handoff_contact: 'Luovutusyhteyshenkilö' },
    undo: 'Kumoa', source: 'Lähde', close: 'Sulje', factor: { readiness: 'Valmius', schedule: 'Aikataulu', route: 'Reitti', car: 'Auto', driver: 'Kuljettaja', market: 'Kuljettajamarkkina', external: 'Uutiset' },
    group_affects: 'Koskee {n} autoa', group_decided: 'Päätetty: {choice}. Agentti toteuttaa sen jokaiselle autolle.', reroute: 'Varaa kaikki uudelleen', keep_warn: 'Pidä ja varoita',
    nothing: 'Ei avoimia signaaleja.', resolved: 'Agentti ratkaisi tämän ilman ihmistä.', change_ph: 'Mitä pitäisi tehdä?', confirm_change: 'Lähetä agentille', approve: 'Hyväksy', change: 'Muuta',
    customer_draft: 'Asiakasviesti on luonnosteltu sinun lähetettäväksesi.',
    kind: { DEALERSHIP: 'Jälleenmyyjä', SOURCE_DEALER: 'Myyvä jälleenmyyjä', PRIVATE_HOME: 'Yksityinen myyjä', TRANSFER_YARD: 'Siirtoterminaali', INDEPENDENT_STORAGE: 'Varastoalue', THIRD_PARTY_BUSINESS: 'Yritys' },
    country: { FI: 'Suomi', EE: 'Viro' },
    step: { get_order_overview: 'Tarkisti tilauksen', get_messages: 'Luki viestit', get_driver_record: 'Tarkisti kuljettajan historian', get_live_conditions: 'Tarkisti sään ja tiet', check_ferry_options: 'Tarkisti lautat', find_alternative_drivers: 'Vertasi muita kuljettajia', ask_driver: 'Kysyi kuljettajalta', contact_pickup_site: 'Kysyi noutopaikalta', propose_decision: 'Lähetti sinulle ehdotuksen', resolve_without_person: 'Sulki ilman sinua' },
  },
};

const state = { lang: localGet('lang') || 'en', view: 'board', report: null, tab: 'needs_you', data: null, sel: null, detail: null, showAll: false, busy: false, open: new Set() };
const $ = (s) => document.querySelector(s);
const t = (k, vars = {}) => String(k.split('.').reduce((o, p) => o?.[p], T[state.lang]) ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
const L = (obj) => (obj && typeof obj === 'object' ? obj[state.lang] || obj.en : obj || '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Agent text, made readable for ops: tool names become plain sources, odd Unicode
// spaces and hyphens become normal ones, and **bold** renders instead of showing stars.
const SOURCE_NAMES = {
  get_order_overview: 'order risk check', get_messages: 'order messages', get_driver_record: 'driver record',
  get_live_conditions: 'live weather and roads', check_ferry_options: 'ferry options', find_alternative_drivers: 'driver ranking',
  ask_driver: "driver's reply", contact_pickup_site: "pickup site's reply", propose_decision: 'agent proposal',
};
const agentText = (s) => esc(String(s ?? '')
  .replace(/[     ]/g, ' ').replace(/[‐‑]/g, '-')
  .replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (w) => SOURCE_NAMES[w] || w.replace(/_/g, ' '))
  .replace(/,\s*source\)/gi, ')'))
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/[*`]/g, '');
// Source labels and actor names in the current language (server sends cached Finnish).
const srcLabel = (s) => (state.lang === 'fi' && s.labelFi) || s.label;
const whoName = (w) => { const n = t('who.' + w); return n.startsWith('who.') ? w : n; };
// Agent replies: lines starting with •, - or * become a real list.
function bulleted(text) {
  const lines = String(text ?? '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const items = lines.filter((l) => /^[•\-*]\s+/.test(l));
  if (items.length < 2) return agentText(text);
  const lead = lines.filter((l) => !/^[•\-*]\s+/.test(l));
  return `${lead.length ? agentText(lead.join(' ')) : ''}<ul class="say-list">${items.map((l) => `<li>${agentText(l.replace(/^[•\-*]\s+/, ''))}</li>`).join('')}</ul>`;
}
// The agent's proposal in the current language (Finnish translation when available).
const P = (p, key) => (state.lang === 'fi' && p.fi?.[key]) || p[key];
function localGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

const TZ = 'Europe/Helsinki';
const fmt = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) =>
  iso ? new Date(iso).toLocaleString(state.lang === 'fi' ? 'fi-FI' : 'en-GB', { timeZone: TZ, ...opts }) : '—';
const fmtH = (h) => { const a = Math.abs(h); return a < 1 ? `${Math.round(a * 60)} min` : a < 48 ? `${Math.round(a * 10) / 10} h` : `${Math.round(a / 24)} d`; };
const confClass = (c) => (c < 55 ? 'low' : c < 80 ? 'mid' : 'high');
const carImg = (v) => v ? `/car-images/${`${v.make}-${v.model}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.webp` : '';
const carName = (v) => (v ? `${v.make} ${v.model}` : 'Unknown car');
const cc = (c) => `<span class="cc ${esc(c)}" title="${esc(t('country.' + c))}">${esc(c)}</span>`;

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

// ---------- Queue ----------
async function loadOverview() {
  state.data = await api('/api/overview');
  renderTop();
  renderQueue();
}

function renderTop() {
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === state.lang));
  document.documentElement.lang = state.lang;
  $('#report-link').textContent = state.view === 'report' ? rt('back') : rt('link');
  $('#report-link').classList.toggle('on', state.view === 'report');
  const l = state.data?.live;
  const el = $('#live');
  if (!l) return;
  const on = l.status === 'live' || l.status === 'partial';
  el.className = `live ${on ? 'on' : ''}`;
  // Two clocks: the order data is a snapshot (fixed time); weather and roads are fetched live.
  const liveAt = [l.weatherAt, l.trafficAt].filter(Boolean).sort().at(-1);
  el.innerHTML = `<b>${t('orders_as_of')}</b> ${esc(fmt(state.data.snapshotAt))} <span class="sep">·</span> <span class="dot"></span>${esc(t(on ? 'live' : 'offline', { t: fmt(liveAt, { hour: '2-digit', minute: '2-digit' }) }))}`;
  el.title = `Weather ${fmt(l.weatherAt)} · ${l.trafficCount} road notices · The order data is a snapshot; its clock is fixed.`;
}

function renderQueue() {
  const { orders, groups } = state.data;
  const count = (lane) => orders.filter((o) => o.lane === lane).length;
  $('#tabs').innerHTML = ['needs_you', 'agent', 'clear', 'done'].map((lane) =>
    `<button class="tab ${lane === state.tab && state.view === 'board' ? 'on' : ''} ${lane === 'needs_you' ? 'primary' : ''}" data-tab="${lane}">${t(lane)}<b>${count(lane)}</b></button>`).join('');

  const n = count(state.tab);
  $('#queue-title').textContent = state.tab === 'needs_you' ? (n === 1 ? t('title_needs_one') : t('title_needs', { n })) : t(`title_${state.tab}`, { n });
  $('#queue-sub').textContent = t(`sub_${state.tab === 'needs_you' ? 'needs' : state.tab}`);

  $('#groups').innerHTML = state.tab !== 'needs_you' ? '' : groups.map((g) => g.decided
    ? `<div class="group"><h3>${esc(L(g.text))}</h3><p>${t('group_decided', { choice: esc(g.decided.choice === 'approve' ? t('reroute') : t('keep_warn')) })}</p></div>`
    : `<div class="group">
        <h3>${esc(L(g.text).split('. ')[0])}</h3>
        <p>${esc(L(g.detail))}</p>
        <div class="refs">${t('group_affects', { n: g.orders.length })}: ${g.orders.join(', ')} · <button class="src" data-src="${g.source.table}/${g.source.id}">${esc(g.source.label)}</button></div>
        <div class="actions"><button class="btn primary small" data-group="${g.id}" data-choice="approve">${t('reroute')}</button><button class="btn small" data-group="${g.id}" data-choice="change">${t('keep_warn')}</button></div>
      </div>`).join('');

  const list = orders.filter((o) => o.lane === state.tab);
  if (!list.length) {
    $('#list').innerHTML = state.tab === 'needs_you'
      ? `<li class="empty"><h3>${t('empty_needs')}</h3>${t('empty_needs_sub', { n: count('agent') })}</li>`
      : `<li class="empty">${t('empty_other')}</li>`;
    return;
  }
  // Needs-you rows: deadline first, then what to do. The most urgent one is called out.
  $('#list').innerHTML = list.map((o, i) => {
    const needs = state.tab === 'needs_you';
    const action = needs ? L(o.decision?.text || o.whyYou?.text || o.headline) : L(o.agentWork?.[0] || o.headline) || t('nothing');
    return `<li><button class="row ${o.id === state.sel ? 'sel' : ''} ${needs && i === 0 ? 'first' : ''}" data-id="${o.id}">
      ${needs && i === 0 ? `<div class="row-flag">${t('next_up')}</div>` : ''}
      <div class="row-top">
        <div class="route-line">${esc(o.from.city)} ${cc(o.from.country)}<span class="arrow">→</span>${esc(o.to.city)} ${cc(o.to.country)}</div>
        ${needs ? deadlineChip(o.deadline) : `<span class="conf ${confClass(o.confidence)}" title="${t('confidence')}">${o.confidence}%</span>`}
      </div>
      ${action ? `<div class="why-line ${needs ? '' : 'calm'}"><span>${esc(action.replace(/^(Agent|Agentti): /, ''))}</span></div>` : ''}
      <div class="meta-line">${o.ref} · ${esc(carName(o.vehicle))}${o.driver ? ` · ${esc(o.driver.name)}` : ''}</div>
    </button></li>`;
  }).join('');
}

// ---------- Detail ----------
async function openOrder(id, { quiet = false } = {}) {
  state.sel = id;
  state.showAll = false;
  const ref = state.data?.orders.find((o) => o.id === id)?.ref;
  if (ref && location.hash !== `#${ref}`) history.replaceState(null, '', `#${ref}`);
  document.querySelector('.layout').classList.add('open');
  renderQueue();
  if (!quiet) $('#detail').innerHTML = skeleton();
  try { state.detail = await api(`/api/orders/${id}`); } catch (e) { $('#detail').innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  renderDetail();
}

function skeleton() {
  return `<div class="skel" style="height:120px;margin-bottom:16px"></div><div class="skel" style="height:70px;margin-bottom:16px"></div><div class="skel" style="height:220px"></div>`;
}

function renderDetail() {
  const d = state.detail;
  if (!d) {
    $('#detail').innerHTML = `<div class="empty" style="text-align:left;padding:40px 0"><h3>${t('pick')}</h3>${t('pick_sub')}</div>`;
    return;
  }
  const human = d.reasons.filter((r) => !r.agentCan && !r.group);
  const watch = d.reasons.filter((r) => r.agentCan || r.group);
  const p = pendingProposal(d);
  const found = p ? P(p, 'what_i_found') || [] : [];
  const steps = d.run?.steps?.length || 0;
  // One action panel and the map; everything else is one click away.
  $('#detail').innerHTML = `
    <button class="back" data-back>← ${t(state.tab)}</button>
    ${actionPanel(d)}
    <div class="mapcard"><div id="map" class="map" role="img" aria-label="${t('map_label')}"></div>${mapLegend()}</div>
    <div class="details">
      ${section('evidence', t('sec_evidence', { n: human.length + watch.length + found.length }),
        `${found.length ? `<div class="subhead">${t('agent_found')}</div><ul class="found">${found.map((f) => `<li>${agentText(f)}</li>`).join('')}</ul>` : ''}
         ${human.length ? `<div class="subhead">${t('why_more')}</div>${reasonList(human)}` : ''}
         ${watch.length ? `<div class="subhead">${t('why_watch')}</div>${reasonList(watch)}` : ''}`)}
      ${section('arrival', t('sec_arrival', { c: d.confidence }), `<div class="grid2"><div>${confidenceBlock(d)}</div><div><h2>${t('times')}</h2>${timesBlock(d)}</div></div>`)}
      ${section('route', t('sec_route'), conditionsBlock(d))}
      ${section('agent', t('sec_agent', { n: steps }), agentCard(d))}
      ${section('driver', t('sec_driver', { name: d.driver?.name || t('no_driver') }), driverBlock(d))}
      ${section('history', t('sec_history', { n: d.timeline.length }), timelineBlock(d))}
    </div>`;
  drawMap(d.id);
}

const pendingProposal = (d) => (d.run?.outcome?.type === 'proposal' && d.run.outcome.status === 'PENDING_APPROVAL' ? d.run.outcome : null);

// Collapsible section; which ones are open is remembered across re-renders.
function section(id, title, body) {
  return `<details class="sec" data-sec="${id}" ${state.open.has(id) ? 'open' : ''}><summary>${title}</summary><div class="sec-body">${body}</div></details>`;
}

// Minutes from the data's clock (the snapshot is fixed in time) to a deadline.
const minsLeft = (iso) => Math.round((Date.parse(iso) - Date.parse(state.data.snapshotAt)) / 60000);
function fmtDur(m) {
  const a = Math.abs(m);
  if (a < 60) return `${a} min`;
  if (a < 48 * 60) return `${Math.floor(a / 60)} h${a % 60 ? ` ${a % 60} min` : ''}`;
  return `${Math.round(a / 1440)} d`;
}
function deadlineChip(dl, big = false) {
  if (!dl) return '';
  const m = minsLeft(dl.at);
  const cls = m < 0 ? 'over' : m < 180 ? 'urgent' : m < 1440 ? 'soon' : 'calm';
  const left = m < 0 ? t('overdue', { t: fmtDur(m) }) : t('left', { t: fmtDur(m) });
  if (!big) return `<span class="dl ${cls}">${left}</span>`;
  return `<div class="ap-deadline ${cls}"><b>${left}</b><span>${esc(L(dl.text))} · ${fmt(dl.at, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>`;
}

// The top of the order: deadline, why, the one decision, and what it does to arrival.
function actionPanel(d) {
  const head = `<div class="ap-route">${esc(d.from.city)} ${cc(d.from.country)} <span class="arrow">→</span> ${esc(d.to.city)} ${cc(d.to.country)}
    <span class="ap-meta">${esc(carName(d.vehicle))}${d.value !== 'standard' ? ` <span class="pill">${d.value === 'exceptional' ? '€€€' : '€€'}</span>` : ''} · ${d.ref}${d.driver ? ` · ${esc(d.driver.name)}` : ''} · ${esc(d.customer || '')}</span></div>`;
  if (d.decided) {
    const choice = d.decided.label ? `“${L(d.decided.label)}”` : t(d.decided.choice === 'approve' ? 'approved' : 'changed');
    return `<section class="ap">${head}<div class="done-note">${t('decided_note', { choice: esc(choice), time: fmt(d.decided.at, { hour: '2-digit', minute: '2-digit' }) })}
      ${d.decided.note ? `<br>“${esc(d.decided.note)}”` : ''}${d.decided.effect ? `<br><span>${agentText(d.decided.effect)}</span>` : ''}</div>
      <div class="actions" style="margin-top:12px"><button class="btn small" data-undo>${t('undo')}</button></div>${arrivalLine(d)}</section>`;
  }
  const p = pendingProposal(d);
  const why = d.whyYou ? `<p class="ap-why">${esc(L(d.whyYou.text))}
    ${d.whyYou.source ? `<button class="src" data-src="${d.whyYou.source.table}/${encodeURIComponent(d.whyYou.source.id || '')}">${esc(srcLabel(d.whyYou.source))}</button>` : ''}</p>` : '';
  if (!p && !d.decision) {
    // Not a person's call: say what the agent is doing.
    return `<section class="ap calm">${head}<p class="ap-why calm">${esc(L(d.agentWork?.[0]) || t('nothing'))}</p>${arrivalLine(d)}</section>`;
  }
  // Headline = first sentence; the rest reads as normal text.
  const full = p ? P(p, 'suggestion') : L(d.decision.text);
  const cut = full.search(/[.!?](\s|$)/);
  const headline = cut > 0 ? full.slice(0, cut + 1) : full;
  const restText = cut > 0 ? full.slice(cut + 1).trim() : '';
  const text = `${p ? agentText(headline) : esc(headline)}${restText ? `</p><p class="ap-rest">${p ? agentText(restText) : esc(restText)}` : ''}`;
  const next = p ? `${agentText(P(p, 'if_approved'))}${p.cost_eur ? ` · €${p.cost_eur}` : ''}${p.customer_must_be_told ? ` · ${t('customer_draft')}` : ''}` : esc(L(d.decision.effect));
  return `<section class="ap urgent">
    ${deadlineChip(d.deadline, true)}
    ${head}
    ${why}
    <div class="ap-label">${p ? t('agent_suggests') : t('decision')}</div>
    <p class="ap-decision">${text}</p>
    ${p ? decisionButtons({ en: t('approve'), fi: t('approve') }, { en: t('change'), fi: t('change') }) : decisionButtons(d.decision.approve, d.decision.change)}
    <div class="next"><span><b>${t('what_next')}</b> ${next}</span></div>
    ${arrivalLine(d)}
  </section>`;
}

// One line: arrival if nobody acts vs. if you approve, against the latest acceptable time.
function arrivalLine(d) {
  const plan = d.etaPlan;
  const tag = (at) => {
    if (!at) return `<b class="bad">${t('unknown')}</b>`;
    const late = d.lta && Date.parse(at) > Date.parse(d.lta);
    return `<b class="${late ? 'bad' : 'good'}">${fmt(at, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</b> <span class="chip ${late ? 'late' : 'ok'}">${late ? t('late_by', { h: fmtH((Date.parse(d.lta) - Date.parse(at)) / 3600e3) }) : t('on_time')}</span>`;
  };
  const latest = d.lta ? `<span class="muted">${t('lta')}: ${fmt(d.lta, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : '';
  if (d.lane === 'needs_you' && !d.decided && plan?.ifNothing) {
    return `<div class="ap-arrival"><span>${t('if_nothing')}: ${tag(plan.ifNothing.at)}</span>${plan.ifApproved ? `<span class="arrow">→</span><span>${t('if_approve_short')}: ${tag(plan.ifApproved.at)}</span>` : ''}${latest}</div>`;
  }
  return d.predicted ? `<div class="ap-arrival"><span>${t('predicted')}: ${tag(d.predicted)}</span>${latest}</div>` : '';
}

// ---------- Map: route legs coloured by risk on OpenStreetMap ----------
let map;
async function drawMap(id) {
  const el = $('#map');
  const Lf = window.L;
  if (!el || !Lf) return;
  if (map) { map.remove(); map = null; }
  map = Lf.map(el, { scrollWheelZoom: false, attributionControl: true });
  Lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · routes: OSRM' }).addTo(map);
  const data = await api(`/api/orders/${id}/map`).catch(() => null);
  if (!data || state.sel !== id) return;
  const bounds = [];
  for (const l of data.legs) {
    if (!l.line?.length) continue;
    Lf.polyline(l.line, { color: l.color, weight: l.mode === 'ferry' ? 3 : 5, opacity: 0.9, dashArray: l.mode === 'ferry' ? '8 8' : null }).addTo(map).bindTooltip(esc(L2(l.label)));
    bounds.push(...l.line);
  }
  const COLORS = { risk: '#b23a22', warn: '#c8871b', good: '#1f7a4d', info: '#12110e' };
  for (const m of data.markers) {
    const big = m.kind === 'pickup' || m.kind === 'delivery';
    const marker = Lf.circleMarker([m.lat, m.lon], { radius: big ? 8 : m.level === 'risk' ? 8 : 6, color: '#fff', weight: 2, fillColor: COLORS[m.level] || '#12110e', fillOpacity: 1 }).addTo(map);
    marker.bindTooltip(`${big ? `<b>${m.kind === 'pickup' ? 'A' : 'B'}</b> ` : ''}${esc(L2(m.text))}`);
    if (big || m.level === 'risk') bounds.push([m.lat, m.lon]);
  }
  if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
}
const L2 = (x) => (x && typeof x === 'object' ? x[state.lang] || x.en : x || '');
function mapLegend() {
  return `<div class="legend"><span><i class="k ok"></i>${t('lg_clear')}</span><span><i class="k risk"></i>${t('lg_risk')}</span><span><i class="k warn"></i>${t('lg_warn')}</span><span><i class="k good"></i>${t('lg_good')}</span><span><i class="k ferry"></i>${t('lg_ferry')}</span></div>`;
}

function decisionButtons(approve, change) {
  return `<div class="actions" id="decide">
    <button class="btn primary" data-decide="approve">${esc(L(approve))}</button>
    <button class="btn" data-change>${esc(L(change))}</button>
  </div>${optionsBlock(state.detail)}`;
}

// Other ways out (e.g. the dealer has no matching car): each one says what happens.
function optionsBlock(d) {
  if (!d?.options?.length) return '';
  // One row of buttons; what each does shows on hover and in the confirmation.
  return `<div class="options"><span class="subhead">${t('other_options')}</span>
    ${d.options.map((o, i) => `<button class="btn small ${o.danger ? 'danger' : ''}" data-option="${i}" title="${esc(L(o.effect))}">${esc(L(o.label))}</button>`).join('')}</div>`;
}

function reasonList(list) {
  return `<ul class="reasons">${list.map((r) => `<li class="${r.superseded ? 'superseded' : ''}">
    <span class="dot ${r.superseded ? '' : r.r >= 0.3 ? 'hi' : r.r >= 0.12 ? 'md' : ''}"></span>
    <div>${r.superseded ? `<span class="tag">${t('superseded')}</span><br>` : ''}${esc(L(r.text))}<br>
      <button class="src" data-src="${r.source.table}/${encodeURIComponent(r.source.id || '')}">${esc(srcLabel(r.source))}${r.source.at ? ` · ${fmt(r.source.at)}` : ''}</button>
      ${r.source.table === 'demo' || r.source.table === 'news' ? `<span class="tag">${t('demo_data')}</span>` : ''}
      ${r.source.table === 'live' ? `<span class="tag live">${t('live_tag')}</span>` : ''}
    </div></li>`).join('')}</ul>`;
}

function confidenceBlock(d) {
  const f = Object.entries(d.factorRisk).filter(([, v]) => v > 0);
  return `<h2>${t('confidence')}</h2>
    <div class="confbig"><b class="${confClass(d.confidence)}">${d.confidence}%</b></div>
    <p class="conf-sub">${t('conf_sub')}</p>
    ${f.length ? `<div class="bars">${f.map(([k, v]) => `<span>${t('factor.' + k)}</span><span class="bar"><i style="width:${v}%"></i></span><span class="n">${v}</span>`).join('')}</div>` : `<p class="hint">${t('nothing')}</p>`}`;
}

// Arrival: the customer's original ETA and latest time, then what happens if nobody
// acts and what the new ETA is if the person approves.
function timesBlock(d) {
  const status = (at) => {
    if (!at) return `<span class="chip unknown">${t('unknown')}</span>`;
    if (!d.lta) return '';
    const h = (Date.parse(d.lta) - Date.parse(at)) / 3600e3;
    return h < 0 ? `<span class="chip late">${t('late_by', { h: fmtH(h) })}</span>` : `<span class="chip ok">${t('on_time')}</span>`;
  };
  const vsOrig = (at) => {
    if (!at || !d.eta) return '';
    const h = (Date.parse(at) - Date.parse(d.eta)) / 3600e3;
    return Math.abs(h) < 0.25 ? '' : t('vs_orig', { d: `${h > 0 ? '+' : '−'}${fmtH(h)}` });
  };
  const row = (cls, k, at, note) => `<li class="${cls}"><span class="k">${k}</span><span class="v">${at ? fmt(at) : t('unknown')}</span>
    <span class="note">${[status(at), esc(note || ''), vsOrig(at)].filter(Boolean).join(' · ')}</span></li>`;
  const plan = d.etaPlan;
  const deciding = d.lane === 'needs_you' && !d.decided;
  const parts = [
    `<li><span class="k">${t('eta_orig')}</span><span class="v">${fmt(d.eta)}</span></li>`,
    `<li><span class="k">${t('lta')}</span><span class="v">${fmt(d.lta)}</span></li>`,
  ];
  if (deciding && plan?.ifNothing) parts.push(row('nothing', t('if_nothing'), plan.ifNothing.at, L(plan.ifNothing)));
  else if (d.predicted) parts.push(row('', t('predicted'), d.predicted, ''));
  if (deciding && plan?.ifApproved) parts.push(row('approve', t('if_approve'), plan.ifApproved.at, L(plan.ifApproved)));
  return `<ul class="eta">${parts.join('')}</ul>`;
}

function conditionsBlock(d) {
  const fi = state.lang === 'fi';
  // `port` is the end of the leg that is the ferry harbour (0 = start, 1 = end).
  const PORTS = { 'West Baltic terminal': 'Travemünde', 'South Finland terminal': 'Helsinki' };
  const legName = (key, port) => key.split('|').map((c, i) => { const n = PORTS[c] || c; return i === port || PORTS[c] ? `${n} ${t('harbour')}` : n; }).join(' → ');
  const leg = (icon, r, port) => `<li><span class="ic">${icon}</span><span><b>${esc(legName(r.key, port))}</b> · ${Math.round(r.km)} km · ${fmtH(r.minutes / 60)}
    <button class="src" data-src="route/${encodeURIComponent(r.key)}">OSM</button></span></li>`;
  const legs = [];
  const eeFirst = d.gulf === 'TLL-HEL';
  if (d.eeRoute && eeFirst) legs.push(leg('EE', d.eeRoute, 1));
  if (d.fiRoute && d.gulf === 'HEL-TLL') legs.push(leg('FI', d.fiRoute, 1));
  const booked = d.ferry ? `${t('booked')}: ${d.ferry.provider ? `${esc(d.ferry.provider)} ` : ''}${fmt(d.ferry.departs, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : `<span class="bad">${t('not_booked')}</span>`;
  if (d.gulf) {
    legs.push(`<li><span class="ic">≈</span><span><b>${d.gulf === 'TLL-HEL' ? 'Tallinn → Helsinki' : 'Helsinki → Tallinn'}</b> · ${booked}
      <button class="src" data-src="timetable/${d.gulf}">${t('timetable')}</button></span></li>`);
  }
  // Continent → Finland: drive to Travemünde, ferry to Helsinki.
  const baltic = d.legs?.some((l) => l.mode === 'ferry' && l.key.startsWith('West Baltic'));
  if (d.contRoute && baltic) {
    legs.push(leg(d.from.country, d.contRoute, 1));
    legs.push(`<li><span class="ic">≈</span><span><b>Travemünde → Helsinki</b> · ${booked}</span></li>`);
  }
  if (d.eeRoute && d.gulf === 'HEL-TLL') legs.push(leg('EE', d.eeRoute, 0));
  if (d.fiRoute && d.gulf !== 'HEL-TLL') legs.push(leg('FI', d.fiRoute, d.gulf ? 0 : -1));
  if (d.contRoute && !baltic) legs.push(leg(d.from.country, d.contRoute, -1));
  if (!legs.length) legs.push(`<li><span class="ic">→</span><span>${d.driveKm} km</span></li>`);

  const r = d.fiRoute || d.contRoute;
  const e = d.energy;
  const energy = !e ? '' : e.kind === 'electric' ? t('stops', { n: e.stops, km: e.rangeKm }) : e.stops ? t('fuel_stops', { n: e.stops }) : t('fuel_ok');
  const live = d.reasons.filter((x) => x.source.table === 'live');
  const ee = d.from.country === 'EE' || d.to.country === 'EE';
  return `<ul class="legs">${legs.join('')}</ul>
    ${r ? `<div class="subhead">${t('along')}</div><div style="font-size:13px">${r.stops.fuel} ${t('fuel')} · ${r.stops.fastCharging} ${t('fast')} · ${r.stops.rest} ${t('rest')}</div>` : ''}
    ${energy ? `<div class="subhead">${t('energy')}</div><div style="font-size:13px">${esc(energy)}${d.vehicle?.fuel === 'electric' && e.stops > 0 && r?.suggestedChargers?.length ?`<br><span class="muted">${t('charge_at')}: ${r.suggestedChargers.map((c) => `${esc(c.name)} (km ${c.kmAlong})`).join(', ')}</span>` : ''}</div>` : ''}
    <div class="subhead">${t('live_h')}</div>
    ${live.length ? reasonList(live) : `<p class="hint" style="margin-top:0">${d.live.status === 'offline' ? t('offline') : t('no_warn')}</p>`}
    ${ee ? `<p class="hint">${t('ee_roads')}</p>` : ''}`;
}

function agentCard(d) {
  const steps = d.run?.steps || [];
  const icon = { tool: '✓', say: '›', person: '›' };
  const label = (s) => {
    if (s.type === 'person') return `<b>${t('you')}:</b> ${esc(s.text)}`;
    if (s.type === 'say') return `<b>${t('agent_label')}:</b> ${bulleted(s.text)}`;
    const q = s.args?.question ? ` “${esc(s.args.question)}”` : '';
    return `<b>${esc(t('step.' + s.name).startsWith('step.') ? s.name.replace(/_/g, ' ') : t('step.' + s.name))}</b>${q}${s.summary && s.name !== 'propose_decision' ? ` — ${agentText((state.lang === 'fi' && s.summaryFi) || s.summary)}` : ''}`;
  };
  const list = steps.length ? `<ul class="steps">${steps.map((s) => `<li class="${s.type}"><span class="ic">${icon[s.type]}</span><span class="t">${label(s)}</span></li>`).join('')}</ul>` : '';
  let body;
  if (!d.agentAvailable) body = `${list}<p class="hint" style="margin-top:0">${t('agent_off')}</p>`;
  else if (state.busy) body = `${list}<div class="working">${t('working')}</div>`;
  else body = `${list || `<div class="actions" style="margin-bottom:12px"><button class="btn soft" data-run>${t('run_agent')}</button></div>`}
    <form class="ask" data-ask><input name="m" placeholder="${t('ask_ph')}" autocomplete="off"><button class="btn primary">${t('send')}</button></form>`;
  return body;
}

function driverBlock(d) {
  const alts = d.alternatives?.length ? `<p class="hint" style="margin-top:14px">${t('better')}</p><ul class="alts">${d.alternatives.map((a) => `<li><span>${esc(a.name)} · ${esc(a.homeCity)}<small>${esc(((state.lang === 'fi' && a.whyFi) || a.why).join(' · '))}</small></span><button class="btn small" data-offer="${a.id}" data-name="${esc(a.name)}">${t('offer_to')}</button></li>`).join('')}</ul>` : '';
  if (!d.driver) return `<p class="muted" style="margin:0">${t('no_driver')}</p>${alts}`;
  const r = d.driver;
  return `<div style="font-weight:600">${esc(r.name)} <span class="tag">${t('demo')}</span></div>
    <div class="muted" style="font-size:13px;margin-bottom:10px">${esc(r.homeCity)} · ${r.years} ${t('yrs')}</div>
    <dl class="kv">
      <dt>${t('on_time_rate')}</dt><dd class="${r.onTimeRate < 0.88 ? 'bad' : ''}">${Math.round(r.onTimeRate * 100)} %</dd>
      <dt>${t('deliveries')}</dt><dd>${r.deliveries12m}</dd>
      <dt>${t('claims')}</dt><dd class="${r.damageClaims12m ? 'bad' : ''}">${r.damageClaims12m}</dd>
    </dl>${alts}`;
}

function timelineBlock(d) {
  const items = state.showAll ? d.timeline : d.timeline.slice(0, 5);
  return `<ul class="timeline">${items.map((e) => `<li><span class="when">${fmt(e.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
    <span><span class="who">${esc(whoName(e.who))}</span>${esc(e.kind === 'message' ? e.text : (state.lang === 'fi' && e.textFi) || e.text)}${e.source ? ` <button class="src" data-src="${e.source.table}/${e.source.id}">${t('source')}</button>` : ''}</span></li>`).join('')}</ul>
    ${d.timeline.length > 5 ? `<button class="linkbtn" data-more>${state.showAll ? t('show_less') : t('show_all', { n: d.timeline.length })}</button>` : ''}`;
}

// ---------- Source drawer ----------
async function openSource(key) {
  const [table, ...rest] = key.split('/');
  const id = decodeURIComponent(rest.join('/'));
  const sheet = $('#source');
  sheet.hidden = false;
  sheet.innerHTML = `<div class="panel"><div class="skel" style="height:200px"></div></div>`;
  const res = await api(`/api/source/${table}/${encodeURIComponent(id)}`).catch((e) => ({ error: e.message }));
  const rec = res.record || res;
  const keyName = (k) => (state.lang === 'fi' && res.keysFi?.[k]) || k.replace(/_/g, ' ');
  const rows = Object.entries(rec || {}).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length));
  const val = (v) => (typeof v === 'object' ? esc(JSON.stringify(v, null, 1)) : esc(String(v)));
  const ex = res.explained;
  // Plain language for the dispatcher; the raw record only on request.
  const plain = ex ? `<h3>${esc(L(ex.title))}</h3>
    ${ex.intro ? `<blockquote class="ev-quote">${esc(L(ex.intro))}</blockquote>` : ''}
    <dl class="kv ev">${ex.facts.map((f) => `<dt>${esc(L(f.label))}</dt><dd>${esc(L(f.value))}</dd>`).join('')}</dl>` : `<h3>${t('source')}</h3>`;
  sheet.innerHTML = `<div class="panel" role="dialog" aria-label="${t('source')}">
    <div class="ev-head"><div class="meta">${t('source')}</div><button class="btn small" data-close>${t('close')}</button></div>
    ${plain}
    <details class="raw"><summary>${t('tech_details')}</summary>
      <div class="meta">${esc(table.replace(/_/g, ' '))} · ${esc(id)}</div>
      <dl class="kv">${rows.map(([k, v]) => `<dt>${esc(keyName(k))}</dt><dd>${val(v)}</dd>`).join('')}</dl></details></div>`;
}

// ---------- Actions ----------
async function decide(choice, note, effect, label = null) {
  await api(`/api/orders/${state.sel}/decide`, { choice, note, effect, label });
  await loadOverview();
  await openOrder(state.sel, { quiet: true });
}

async function runAgent(message) {
  state.busy = true;
  renderDetail();
  try { await api(`/api/orders/${state.sel}/agent`, message ? { message } : {}); }
  catch (e) { alert(e.message); }
  state.busy = false;
  await loadOverview();
  await openOrder(state.sel, { quiet: true });
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('button, [data-close]');
  if (e.target.id === 'source') { $('#source').hidden = true; return; }
  const nx = e.target.closest('.ap .next');
  if (nx && !el) { nx.classList.toggle('open'); return; }
  if (!el) return;
  if (el.hasAttribute('data-report')) { showReport(state.view !== 'report'); return; }
  if (el.dataset.tab) { state.tab = el.dataset.tab; if (state.view === 'report') showReport(false); renderQueue(); return; }
  if (el.dataset.lang) { state.lang = el.dataset.lang; localSet('lang', state.lang); renderTop(); renderQueue(); renderDetail(); renderReport(); return; }
  if (el.dataset.id) { openOrder(el.dataset.id); return; }
  if (el.dataset.src) { openSource(el.dataset.src); return; }
  if (el.hasAttribute('data-close')) { $('#source').hidden = true; return; }
  if (el.hasAttribute('data-back')) { document.querySelector('.layout').classList.remove('open'); return; }
  if (el.hasAttribute('data-more')) { state.showAll = !state.showAll; renderDetail(); return; }
  if (el.hasAttribute('data-run')) { runAgent(); return; }
  if (el.dataset.decide) {
    const p = state.detail.run?.outcome;
    decide('approve', null, p?.type === 'proposal' ? P(p, 'if_approved') : L(state.detail.decision?.effect));
    return;
  }
  if (el.hasAttribute('data-change')) {
    $('#decide').innerHTML = `<form class="ask" data-change-form style="flex:1"><input name="m" placeholder="${t('change_ph')}" autocomplete="off" autofocus><button class="btn primary">${t('confirm_change')}</button></form>`;
    $('#decide input').focus();
    return;
  }
  if (el.dataset.option) {
    const o = state.detail.options[Number(el.dataset.option)];
    if (!confirm(`${L(o.label)}\n\n${L(o.effect)}`)) return;
    decide(o.id, null, L(o.effect), o.label);
    return;
  }
  if (el.hasAttribute('data-undo')) { await api(`/api/orders/${state.sel}/decide`, { choice: null }); await loadOverview(); openOrder(state.sel, { quiet: true }); return; }
  if (el.dataset.offer) { decide('change', `Offer the job to ${el.dataset.name}`, 'The agent offers the job to this driver and releases the current one.'); return; }
  if (el.dataset.group) {
    await api(`/api/groups/${el.dataset.group}/decide`, { choice: el.dataset.choice });
    await loadOverview();
  }
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = e.target.m.value.trim();
  if (!msg) return;
  if (e.target.hasAttribute('data-change-form')) {
    await decide('change', msg, 'The agent will follow your instruction and report back.');
    if (state.detail.agentAvailable) runAgent(`The person decided instead: ${msg}. Carry this out with your tools where allowed, then confirm what you did.`);
    return;
  }
  runAgent(msg);
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#source').hidden = true; });
// Remember which detail sections are open while the page re-renders.
document.addEventListener('toggle', (e) => {
  const id = e.target?.dataset?.sec;
  if (id) e.target.open ? state.open.add(id) : state.open.delete(id);
}, true);

// ---------- Weekly report (management) ----------
const RT = {
  en: {
    link: 'Weekly report', back: 'Back to orders', title: 'Week {n}: caught vs missed', range: '{from} – {to} · data up to {asof}',
    problems: 'Problems recorded', problems_sub: '{pct} % of {n} orders',
    caught: 'Caught', caught_sub: '{early} warned in advance, {on} flagged when it happened',
    missed: 'Missed', missed_sub: 'Nobody was shown these in time',
    lead: 'Warning time', lead_sub: 'median, for those warned in advance', none: '—',
    early: 'Warned in advance', on_time: 'Flagged when it happened', miss: 'Missed',
    load: "Today's load", load_line: '{p} of {n} orders need a person ({pct} %). The agent handles {a}. {c} are on track or delivered.', load_extra: '{x} of the orders sent to a person have no recorded problem yet: open risks, not known false alarms. People have made {d} decisions here.',
    missed_h: 'Missed: what to change', caught_h: 'Caught', earlier_h: 'Earlier weeks', method_h: 'How this is worked out',
    c_order: 'Order', c_what: 'What happened', c_when: 'When', c_fix: 'What would catch it next time', c_how: 'How', c_first: 'First signal', c_week: 'Week', c_deliv: 'Delivered', c_prob: 'Problems',
    ahead: '{h} ahead', by_person: 'to a person', by_agent: 'to the agent',
    earlier_note: 'The snapshot keeps open problems. Problems from earlier weeks were mostly closed before it was taken, so those weeks show few.',
    no_missed: 'Nothing was missed this week.',
  },
  fi: {
    link: 'Viikkoraportti', back: 'Takaisin tilauksiin', title: 'Viikko {n}: havaitut ja ohi menneet', range: '{from} – {to} · tiedot {asof} asti',
    problems: 'Kirjatut ongelmat', problems_sub: '{pct} % / {n} tilausta',
    caught: 'Havaittu', caught_sub: '{early} varoitettu etukäteen, {on} nostettu tapahtuessa',
    missed: 'Ohi mennyt', missed_sub: 'Näitä ei näytetty kenellekään ajoissa',
    lead: 'Varoitusaika', lead_sub: 'mediaani, etukäteen varoitetuista', none: '—',
    early: 'Varoitettu etukäteen', on_time: 'Nostettu tapahtuessa', miss: 'Ohi mennyt',
    load: 'Tämän päivän kuorma', load_line: '{p}/{n} tilausta tarvitsee ihmistä ({pct} %). Agentti hoitaa {a}. {c} on aikataulussa tai toimitettu.', load_extra: '{x} ihmiselle nostetusta tilauksesta ei ole vielä kirjattua ongelmaa: avoimia riskejä, ei todettuja turhia hälytyksiä. Ihmiset ovat tehneet täällä {d} päätöstä.',
    missed_h: 'Ohi menneet: mitä muuttaa', caught_h: 'Havaitut', earlier_h: 'Aiemmat viikot', method_h: 'Miten tämä lasketaan',
    c_order: 'Tilaus', c_what: 'Mitä tapahtui', c_when: 'Milloin', c_fix: 'Mikä sen havaitsisi ensi kerralla', c_how: 'Miten', c_first: 'Ensimmäinen merkki', c_week: 'Viikko', c_deliv: 'Toimitettu', c_prob: 'Ongelmia',
    ahead: '{h} etukäteen', by_person: 'ihmiselle', by_agent: 'agentille',
    earlier_note: 'Tilannekuva sisältää avoimet ongelmat. Aiempien viikkojen ongelmat oli enimmäkseen suljettu ennen sitä, joten niitä näkyy vähän.',
    no_missed: 'Tällä viikolla mikään ei mennyt ohi.',
  },
};
const rt = (k, vars = {}) => String(RT[state.lang][k] ?? k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
const day = (iso) => fmt(iso, { day: 'numeric', month: 'short' });

async function showReport(on) {
  state.view = on ? 'report' : 'board';
  document.querySelector('.layout').hidden = on;
  $('#report').hidden = !on;
  renderTop();
  if (state.data) renderQueue();
  if (!on) { if (location.hash === '#report') history.replaceState(null, '', location.pathname); return; }
  if (location.hash !== '#report') history.replaceState(null, '', '#report');
  if (!state.report) {
    $('#report').innerHTML = '<div class="rp"><div class="skel" style="height:120px"></div></div>';
    try { state.report = await api('/api/report'); } catch (e) { $('#report').innerHTML = `<div class="rp"><p class="muted">${esc(e.message)}</p></div>`; return; }
  }
  renderReport();
}

function renderReport() {
  const r = state.report;
  if (!r || state.view !== 'report') return;
  const w = r.week, q = r.queue;
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const orderCell = (x) => `<a class="ref" href="#${esc(x.ref)}">${esc(x.ref)}</a><div class="sub">${esc(x.from)} → ${esc(x.to)}</div>`;
  const what = (x) => `${esc(L(x.what))}${x.also?.length ? `<div class="sub">${x.also.map((a) => esc(L(a))).join(' · ')}</div>` : ''}`;
  const srcBtn = (s) => (s?.table ? ` <button class="src" data-src="${s.table}/${encodeURIComponent(s.id || '')}">${t('source')}</button>` : '');
  const seg = (n, cls, label) => (n ? `<span class="seg ${cls}" style="flex:${n}" title="${esc(label)}: ${n}"></span>` : '');
  $('#report').innerHTML = `<div class="rp">
    <h1 class="queue-title">${rt('title', { n: w.weekNo })}</h1>
    <p class="queue-sub">${rt('range', { from: day(w.week + 'T12:00:00Z'), to: day(w.endDay + 'T12:00:00Z'), asof: fmt(r.asOf) })}</p>

    <div class="tiles">
      <div class="tile"><div class="k">${rt('problems')}</div><div class="v">${w.problems}</div><div class="s">${rt('problems_sub', { pct: pct(w.problems, r.scope), n: r.scope })}</div></div>
      <div class="tile good"><div class="k">${rt('caught')}</div><div class="v">${w.caught}<small> / ${w.problems} · ${pct(w.caught, w.problems)} %</small></div><div class="s">${rt('caught_sub', { early: w.early, on: w.onTime })}</div></div>
      <div class="tile bad"><div class="k">${rt('missed')}</div><div class="v">${w.missed}</div><div class="s">${rt('missed_sub')}</div></div>
      <div class="tile"><div class="k">${rt('lead')}</div><div class="v">${w.medianLeadH != null ? fmtH(w.medianLeadH) : rt('none')}</div><div class="s">${rt('lead_sub')}</div></div>
    </div>
    <div class="split" role="img" aria-label="${esc(`${rt('early')} ${w.early}, ${rt('on_time')} ${w.onTime}, ${rt('miss')} ${w.missed}`)}">${seg(w.early, 'early', rt('early'))}${seg(w.onTime, 'ontime', rt('on_time'))}${seg(w.missed, 'missed', rt('miss'))}</div>
    <div class="legend"><span><i class="early"></i>${rt('early')} ${w.early}</span><span><i class="ontime"></i>${rt('on_time')} ${w.onTime}</span><span><i class="missed"></i>${rt('miss')} ${w.missed}</span></div>

    <p class="load"><b>${rt('load')}:</b> ${rt('load_line', { p: q.needsYou, n: q.orders, pct: pct(q.needsYou, q.orders), a: q.agent, c: q.clear })} ${rt('load_extra', { x: q.raisedWithoutProblem, d: r.decisions })}</p>

    <h2 class="rp-h">${rt('missed_h')}</h2>
    ${r.missed.length ? `<div class="rt-wrap"><table class="rt"><thead><tr><th>${rt('c_order')}</th><th>${rt('c_what')}</th><th>${rt('c_when')}</th><th>${rt('c_fix')}</th></tr></thead><tbody>
      ${r.missed.map((x) => `<tr><td>${orderCell(x)}</td><td>${what(x)}${srcBtn(x.source)}</td><td>${fmt(x.at)}</td><td>${esc(L(x.fix) || '')}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${rt('no_missed')}</p>`}

    <h2 class="rp-h">${rt('caught_h')}</h2>
    <div class="rt-wrap"><table class="rt"><thead><tr><th>${rt('c_order')}</th><th>${rt('c_what')}</th><th>${rt('c_how')}</th><th>${rt('c_first')}</th></tr></thead><tbody>
      ${r.caught.map((x) => `<tr><td>${orderCell(x)}</td><td>${what(x)}<div class="sub">${fmt(x.at)}</div></td>
        <td><span class="pill ${x.outcome === 'early' ? 'early' : 'ontime'}">${x.outcome === 'early' ? rt('ahead', { h: fmtH(x.leadH) }) : rt('on_time')}</span><div class="sub">${rt(x.who === 'person' ? 'by_person' : 'by_agent')}</div></td>
        <td>${esc(L(x.signal) || '')}${srcBtn(x.source)}</td></tr>`).join('')}</tbody></table></div>

    <h2 class="rp-h">${rt('earlier_h')}</h2>
    <div class="rt-wrap"><table class="rt narrow"><thead><tr><th>${rt('c_week')}</th><th>${rt('c_deliv')}</th><th>${rt('c_prob')}</th><th>${rt('caught')}</th><th>${rt('missed')}</th></tr></thead><tbody>
      ${r.history.map((h) => `<tr><td>${h.weekNo} <span class="sub">${day(h.week + 'T12:00:00Z')}</span></td><td>${h.delivered}</td><td>${h.problems}</td><td>${h.caught}</td><td>${h.missed}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small">${rt('earlier_note')}</p>

    <details class="sec"><summary>${rt('method_h')}</summary><p class="muted">${esc(L(r.method))}</p></details>
  </div>`;
}

// Links like /#CD-421105 open that order directly.
function openFromHash() {
  if (location.hash === '#report') { showReport(true); return true; }
  const o = state.data?.orders.find((x) => x.ref === decodeURIComponent(location.hash.slice(1)));
  if (!o) return false;
  if (state.view === 'report') showReport(false);
  state.tab = o.lane;
  openOrder(o.id);
  return true;
}
window.addEventListener('hashchange', () => openFromHash());

// Header height, so the order list can fill the rest of the window and scroll on its own.
new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', `${$('.top').offsetHeight}px`)).observe($('.top'));
renderTop();
$('#list').innerHTML = Array.from({ length: 5 }, () => '<li class="skel" style="height:96px"></li>').join('');
renderDetail();
loadOverview().then(() => {
  if (openFromHash()) return;
  const first = state.data.orders.find((o) => o.lane === 'needs_you');
  if (first && window.innerWidth > 900) openOrder(first.id);
});
// Background refresh; a server restart just means trying again next minute.
setInterval(() => !state.busy && loadOverview().catch(() => {}), 60e3);
