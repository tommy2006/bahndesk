// Bahn Control Room front end. Plain JS, no build step.
const T = {
  en: {
    product: 'Control room', needs_you: 'Needs you', agent: 'Agent handling', clear: 'On track', done: 'Delivered',
    title_needs: '{n} orders need you', title_needs_one: '1 order needs you', title_agent: 'Agent is handling {n}', title_clear: '{n} on track', title_done: '{n} delivered',
    sub_needs: 'Finland and Estonia. The agent did the legwork; each one needs a judgement call.', sub_agent: 'The agent is on these and will bring you anything it cannot settle.', sub_clear: 'Nothing to do. Shown for reference.', sub_done: 'Handed over.',
    live: 'Live conditions', offline: 'Live data offline · last saved', snapshot: 'Clock',
    empty_needs: 'Nothing needs you right now', empty_needs_sub: 'The agent is handling {n} orders and will bring you anything it cannot settle.',
    empty_other: 'No orders here', pick: 'Pick an order', pick_sub: 'Orders that need a decision are on the left. Everything else is handled or on track.',
    from: 'From', to: 'To', why_you: 'Why you need to look', decision: 'Your decision', agent_suggests: 'Agent suggests', what_next: 'If you approve:',
    why_more: 'Everything else on this order', why_watch: 'What the agent is watching', superseded: 'Earlier suggestion, replaced by the one above',
    confidence: 'Confidence', conf_sub: 'that this delivers on time without a person',
    times: 'Arrival', eta_orig: "Customer's ETA (original)", lta: 'Latest acceptable', if_nothing: 'If nothing is done', if_approve: 'If you approve (new ETA)', predicted: 'Predicted arrival',
    unknown: 'Unknown', late_by: 'late {h}', on_time: 'in time', vs_orig: '{d} vs original',
    conditions: 'Route & road', leg_ee: 'Estonia', leg_fi: 'Finland', ferry: 'Ferry', booked: 'Booked', not_booked: 'Not booked yet', harbour: 'harbour', timetable: 'published timetable',
    along: 'Along the Finnish leg', fuel: 'fuel', fast: 'fast chargers', rest: 'rest areas', energy: 'Energy, whole trip', stops: '{n} charging stop(s), {km} km per charge', fuel_ok: 'No fuel stop needed', fuel_stops: '{n} fuel stop(s)', charge_at: 'Charge at',
    live_h: 'Weather and roads now', no_warn: 'No weather or road warnings on this route.', ee_roads: 'Estonian road notices are not connected yet (Tark Tee needs an API key). Weather is live.',
    driver: 'Driver', no_driver: 'No driver yet', on_time_rate: 'On time', deliveries: 'Deliveries (12 mo)', claims: 'Damage claims (12 mo)', demo: 'demo history',
    better: 'Better-matched drivers', offer_to: 'Offer job',
    agent_title: 'What the agent did', run_agent: 'Let the agent look into it', agent_off: 'The agent is off. Add ANTHROPIC_API_KEY to .env and restart.', working: 'The agent is working…', ask_ph: 'Ask the agent or tell it what to do instead…', send: 'Send', you: 'You',
    timeline: 'What happened', show_all: 'Show all {n}', show_less: 'Show less', decided: 'Decided', decided_note: 'Decided at {time}: {choice}.', approved: 'Approved', changed: 'Changed', other_options: 'Other options', demo_data: 'demo data', live_tag: 'live', yrs: 'yrs', agent_label: 'Agent', who: { operator: 'Operator', driver: 'Driver', customer: 'Customer', agent: 'Agent', system: 'System', person: 'You', site_contact: 'Site', handoff_contact: 'Handover contact' },
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
    sub_needs: 'Suomi ja Viro. Agentti teki selvitystyön; jokainen vaatii harkintaa.', sub_agent: 'Agentti hoitaa nämä ja tuo sinulle vain sen, mitä se ei voi ratkaista.', sub_clear: 'Ei tehtävää. Näytetään tiedoksi.', sub_done: 'Luovutettu.',
    live: 'Reaaliaikaiset olosuhteet', offline: 'Reaaliaikadata ei saatavilla · viimeisin tallennettu', snapshot: 'Kello',
    empty_needs: 'Mikään ei tarvitse sinua juuri nyt', empty_needs_sub: 'Agentti hoitaa {n} tilausta ja tuo sinulle vain sen, mitä se ei voi ratkaista.',
    empty_other: 'Ei tilauksia', pick: 'Valitse tilaus', pick_sub: 'Päätöstä vaativat tilaukset ovat vasemmalla. Kaikki muu on hoidossa.',
    from: 'Mistä', to: 'Minne', why_you: 'Miksi sinun pitää katsoa', decision: 'Päätöksesi', agent_suggests: 'Agentti ehdottaa', what_next: 'Jos hyväksyt:',
    why_more: 'Muut asiat tilauksella', why_watch: 'Mitä agentti seuraa', superseded: 'Aiempi ehdotus, korvattu yllä olevalla',
    confidence: 'Luottamus', conf_sub: 'että toimitus onnistuu ajallaan ilman ihmistä',
    times: 'Saapuminen', eta_orig: 'Asiakkaan toive (alkuperäinen)', lta: 'Viimeistään', if_nothing: 'Jos mitään ei tehdä', if_approve: 'Jos hyväksyt (uusi arvio)', predicted: 'Ennuste',
    unknown: 'Tuntematon', late_by: 'myöhässä {h}', on_time: 'ajallaan', vs_orig: '{d} alkuperäiseen',
    conditions: 'Reitti ja tiet', leg_ee: 'Viro', leg_fi: 'Suomi', ferry: 'Lautta', booked: 'Varattu', not_booked: 'Ei vielä varattu', harbour: 'satama', timetable: 'julkaistu aikataulu',
    along: 'Suomen osuuden varrella', fuel: 'asemaa', fast: 'pikalaturia', rest: 'levähdyspaikkaa', energy: 'Energia, koko matka', stops: '{n} latausta, {km} km / lataus', fuel_ok: 'Ei tankkausta', fuel_stops: '{n} tankkausta', charge_at: 'Lataa',
    live_h: 'Sää ja tiet nyt', no_warn: 'Ei sää- tai tievaroituksia reitillä.', ee_roads: 'Viron tiedotteita ei ole vielä kytketty (Tark Tee vaatii API-avaimen). Sää on reaaliaikainen.',
    driver: 'Kuljettaja', no_driver: 'Ei vielä kuljettajaa', on_time_rate: 'Ajallaan', deliveries: 'Toimituksia (12 kk)', claims: 'Vahinkoja (12 kk)', demo: 'demohistoria',
    better: 'Paremmin sopivat kuljettajat', offer_to: 'Tarjoa',
    agent_title: 'Mitä agentti teki', run_agent: 'Anna agentin selvittää', agent_off: 'Agentti ei ole päällä. Lisää ANTHROPIC_API_KEY .env-tiedostoon.', working: 'Agentti työskentelee…', ask_ph: 'Kysy agentilta tai kerro mitä tehdä…', send: 'Lähetä', you: 'Sinä',
    timeline: 'Tapahtumat', show_all: 'Näytä kaikki {n}', show_less: 'Näytä vähemmän', decided: 'Päätetty', decided_note: 'Päätetty klo {time}: {choice}.', approved: 'Hyväksytty', changed: 'Muutettu', other_options: 'Muut vaihtoehdot', demo_data: 'demodata', live_tag: 'reaaliaikainen', yrs: 'v', agent_label: 'Agentti', who: { operator: 'Operaattori', driver: 'Kuljettaja', customer: 'Asiakas', agent: 'Agentti', system: 'Järjestelmä', person: 'Sinä', site_contact: 'Noutopaikka', handoff_contact: 'Luovutusyhteyshenkilö' },
    undo: 'Kumoa', source: 'Lähde', close: 'Sulje', factor: { readiness: 'Valmius', schedule: 'Aikataulu', route: 'Reitti', car: 'Auto', driver: 'Kuljettaja', market: 'Kuljettajamarkkina', external: 'Uutiset' },
    group_affects: 'Koskee {n} autoa', group_decided: 'Päätetty: {choice}. Agentti toteuttaa sen jokaiselle autolle.', reroute: 'Varaa kaikki uudelleen', keep_warn: 'Pidä ja varoita',
    nothing: 'Ei avoimia signaaleja.', resolved: 'Agentti ratkaisi tämän ilman ihmistä.', change_ph: 'Mitä pitäisi tehdä?', confirm_change: 'Lähetä agentille', approve: 'Hyväksy', change: 'Muuta',
    customer_draft: 'Asiakasviesti on luonnosteltu sinun lähetettäväksesi.',
    kind: { DEALERSHIP: 'Jälleenmyyjä', SOURCE_DEALER: 'Myyvä jälleenmyyjä', PRIVATE_HOME: 'Yksityinen myyjä', TRANSFER_YARD: 'Siirtoterminaali', INDEPENDENT_STORAGE: 'Varastoalue', THIRD_PARTY_BUSINESS: 'Yritys' },
    country: { FI: 'Suomi', EE: 'Viro' },
    step: { get_order_overview: 'Tarkisti tilauksen', get_messages: 'Luki viestit', get_driver_record: 'Tarkisti kuljettajan historian', get_live_conditions: 'Tarkisti sään ja tiet', check_ferry_options: 'Tarkisti lautat', find_alternative_drivers: 'Vertasi muita kuljettajia', ask_driver: 'Kysyi kuljettajalta', contact_pickup_site: 'Kysyi noutopaikalta', propose_decision: 'Lähetti sinulle ehdotuksen', resolve_without_person: 'Sulki ilman sinua' },
  },
};

const state = { lang: localGet('lang') || 'en', tab: 'needs_you', data: null, sel: null, detail: null, showAll: false, busy: false };
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
  const l = state.data?.live;
  const el = $('#live');
  if (!l) return;
  const on = l.status === 'live' || l.status === 'partial';
  el.className = `live ${on ? 'on' : ''}`;
  el.textContent = `${on ? t('live') : t('offline')} · ${t('snapshot')} ${fmt(state.data.snapshotAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  el.title = `Weather ${fmt(l.weatherAt)} · Fintraffic ${l.trafficCount} notices · The order data is a snapshot; its clock is fixed.`;
}

function renderQueue() {
  const { orders, groups } = state.data;
  const count = (lane) => orders.filter((o) => o.lane === lane).length;
  $('#tabs').innerHTML = ['needs_you', 'agent', 'clear', 'done'].map((lane) =>
    `<button class="tab ${lane === state.tab ? 'on' : ''} ${lane === 'needs_you' ? 'primary' : ''}" data-tab="${lane}">${t(lane)}<b>${count(lane)}</b></button>`).join('');

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
  $('#list').innerHTML = list.map((o) => {
    const needs = state.tab === 'needs_you';
    const why = needs ? L(o.whyYou?.text || o.headline) : L(o.agentWork?.[0] || o.headline) || t('nothing');
    return `<li><button class="row ${o.id === state.sel ? 'sel' : ''}" data-id="${o.id}">
      <div class="row-top">
        <div class="route-line">${esc(o.from.city)} ${cc(o.from.country)}<span class="arrow">→</span>${esc(o.to.city)} ${cc(o.to.country)}</div>
        <span class="conf ${confClass(o.confidence)}" title="${t('confidence')}">${o.confidence}%</span>
      </div>
      <div class="meta-line">${esc(carName(o.vehicle))} · ${o.ref}${o.driver ? ` · ${esc(o.driver.name)}` : ''}</div>
      ${why ? `<div class="why-line ${needs ? '' : 'calm'}"><span>${esc(why)}</span></div>` : ''}
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
  $('#detail').innerHTML = `
    <button class="back" data-back>← ${t(state.tab)}</button>
    ${heroBlock(d)}
    ${whyYouBlock(d)}
    <div class="facts">
      <div class="card">${confidenceBlock(d)}</div>
      <div class="card"><h2>${t('times')}</h2>${timesBlock(d)}</div>
      <div class="card"><h2>${t('conditions')}</h2>${conditionsBlock(d)}</div>
    </div>
    ${decisionCard(d)}
    ${human.length > 1 || human.some((r) => r.superseded) ? `<div class="card"><h2>${t('why_more')}</h2>${reasonList(human.filter((r) => r.text !== d.whyYou?.text))}</div>` : ''}
    ${watch.length ? `<div class="card"><h2>${t('why_watch')}</h2>${reasonList(watch)}</div>` : ''}
    ${agentCard(d)}
    <div class="grid2">
      <div class="card"><h2>${t('driver')}</h2>${driverBlock(d)}</div>
      <div class="card"><h2>${t('timeline')}</h2>${timelineBlock(d)}</div>
    </div>`;
}

function heroBlock(d) {
  const end = (lbl, e) => `<div class="endpoint">
    <div class="lbl">${t(lbl)}</div>
    <div class="city">${esc(e.city)} ${cc(e.country)}</div>
    <div class="place">${esc((state.lang === 'fi' && e.nameFi) || e.name || '')}</div>
    <div class="kind">${esc(t('kind.' + e.kind) === 'kind.' + e.kind ? '' : t('kind.' + e.kind))}${e.kind ? ' · ' : ''}${esc(t('country.' + e.country))}</div>
  </div>`;
  return `<div class="hero">
      ${end('from', d.from)}
      <div class="hero-mid"><span class="big">→</span>${d.driveKm} km${d.gulf || d.ferry ? `<br>+ ${t('ferry').toLowerCase()}` : ''}</div>
      ${end('to', d.to)}
    </div>
    <div class="carline">
      ${d.vehicle ? `<img src="${carImg(d.vehicle)}" alt="" onerror="this.remove()">` : ''}
      <div><div class="name">${esc(carName(d.vehicle))}${d.value !== 'standard' ? `<span class="pill">${d.value === 'exceptional' ? '€€€' : '€€'}</span>` : ''}</div>
      <div class="sub">${d.ref} · ${esc(d.customer || '')}${d.driver ? ` · ${esc(d.driver.name)}` : ''}</div></div>
    </div>`;
}

function whyYouBlock(d) {
  if (!d.whyYou || d.decided) return '';
  const s = d.whyYou.source;
  return `<div class="whyyou">
    <span class="icon">!</span>
    <span class="lbl">${t('why_you')}</span>
    <span class="txt">${esc(L(d.whyYou.text))}</span>
    ${s ? `<button class="src" data-src="${s.table}/${encodeURIComponent(s.id || '')}">${esc(srcLabel(s))}${s.at ? ` · ${fmt(s.at)}` : ''}</button>` : ''}
  </div>`;
}

function decisionCard(d) {
  if (d.decided) {
    const choice = d.decided.label ? `“${L(d.decided.label)}”` : t(d.decided.choice === 'approve' ? 'approved' : 'changed');
    return `<div class="card"><h2>${t('decided')}</h2><div class="done-note">${t('decided_note', { choice: esc(choice), time: fmt(d.decided.at, { hour: '2-digit', minute: '2-digit' }) })}
      ${d.decided.note ? `<br>“${esc(d.decided.note)}”` : ''}${d.decided.effect ? `<br><span>${agentText(d.decided.effect)}</span>` : ''}</div>
      <div class="actions" style="margin-top:12px"><button class="btn small" data-undo>${t('undo')}</button></div></div>`;
  }
  const p = d.run?.outcome?.type === 'proposal' && d.run.outcome.status === 'PENDING_APPROVAL' ? d.run.outcome : null;
  if (p) {
    const found = P(p, 'what_i_found') || [];
    return `<div class="card decision"><h2>${t('agent_suggests')}</h2>
      <p class="text">${agentText(P(p, 'suggestion'))}</p>
      <p class="who">${agentText(P(p, 'what_happened'))}</p>
      ${found.length ? `<ul class="found">${found.map((f) => `<li>${agentText(f)}</li>`).join('')}</ul>` : ''}
      ${decisionButtons({ en: t('approve'), fi: t('approve') }, { en: t('change'), fi: t('change') })}
      <div class="next"><b>${t('what_next')}</b> ${agentText(P(p, 'if_approved'))}${p.cost_eur ? ` · €${p.cost_eur}` : ''}${p.customer_must_be_told ? ` · ${t('customer_draft')}` : ''}</div></div>`;
  }
  if (d.run?.outcome?.type === 'resolved') {
    return `<div class="card"><h2>${t('agent_title')}</h2><div class="done-note">${t('resolved')} ${agentText(P(d.run.outcome, 'note'))}</div></div>`;
  }
  if (!d.decision) return '';
  return `<div class="card decision"><h2>${t('decision')}</h2>
    <p class="text">${esc(L(d.decision.text))}</p>
    ${decisionButtons(d.decision.approve, d.decision.change)}
    <div class="next"><b>${t('what_next')}</b> ${esc(L(d.decision.effect))}</div></div>`;
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
  return `<div class="options"><div class="subhead">${t('other_options')}</div>
    ${d.options.map((o, i) => `<div class="option ${o.danger ? 'danger' : ''}">
      <button class="btn small ${o.danger ? 'danger' : ''}" data-option="${i}">${esc(L(o.label))}</button>
      <span>${esc(L(o.effect))}</span></div>`).join('')}</div>`;
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
  const legName = (key, port) => key.split('|').map((c, i) => (i === port ? `${c} ${t('harbour')}` : c)).join(' → ');
  const leg = (icon, r, port) => `<li><span class="ic">${icon}</span><span><b>${esc(legName(r.key, port))}</b> · ${Math.round(r.km)} km · ${fmtH(r.minutes / 60)}
    <button class="src" data-src="route/${encodeURIComponent(r.key)}">OSM</button></span></li>`;
  const legs = [];
  const eeFirst = d.gulf === 'TLL-HEL';
  if (d.eeRoute && eeFirst) legs.push(leg('EE', d.eeRoute, 1));
  if (d.fiRoute && d.gulf === 'HEL-TLL') legs.push(leg('FI', d.fiRoute, 1));
  if (d.gulf) {
    legs.push(`<li><span class="ic">≈</span><span><b>${d.gulf === 'TLL-HEL' ? 'Tallinn → Helsinki' : 'Helsinki → Tallinn'}</b> · ${d.ferry ? `${t('booked')}: ${esc(d.ferry.provider)} ${fmt(d.ferry.departs, { hour: '2-digit', minute: '2-digit' })}` : `<span class="bad">${t('not_booked')}</span>`}
      <button class="src" data-src="timetable/${d.gulf}">${t('timetable')}</button></span></li>`);
  }
  if (d.eeRoute && d.gulf === 'HEL-TLL') legs.push(leg('EE', d.eeRoute, 0));
  if (d.fiRoute && d.gulf !== 'HEL-TLL') legs.push(leg('FI', d.fiRoute, d.gulf ? 0 : -1));
  if (!legs.length) legs.push(`<li><span class="ic">→</span><span>${d.driveKm} km</span></li>`);

  const r = d.fiRoute;
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
    if (s.type === 'say') return `<b>${t('agent_label')}:</b> ${agentText(s.text)}`;
    const q = s.args?.question ? ` “${esc(s.args.question)}”` : '';
    return `<b>${esc(t('step.' + s.name).startsWith('step.') ? s.name.replace(/_/g, ' ') : t('step.' + s.name))}</b>${q}${s.summary && s.name !== 'propose_decision' ? ` — ${agentText((state.lang === 'fi' && s.summaryFi) || s.summary)}` : ''}`;
  };
  const list = steps.length ? `<ul class="steps">${steps.map((s) => `<li class="${s.type}"><span class="ic">${icon[s.type]}</span><span class="t">${label(s)}</span></li>`).join('')}</ul>` : '';
  let body;
  if (!d.agentAvailable) body = `${list}<p class="hint" style="margin-top:0">${t('agent_off')}</p>`;
  else if (state.busy) body = `${list}<div class="working">${t('working')}</div>`;
  else body = `${list || `<div class="actions" style="margin-bottom:12px"><button class="btn soft" data-run>${t('run_agent')}</button></div>`}
    <form class="ask" data-ask><input name="m" placeholder="${t('ask_ph')}" autocomplete="off"><button class="btn primary">${t('send')}</button></form>`;
  return `<div class="card"><h2>${t('agent_title')}</h2>${body}</div>`;
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
  sheet.innerHTML = `<div class="panel" role="dialog" aria-label="${t('source')}">
    <div style="display:flex;justify-content:space-between;align-items:start;gap:12px"><div><h3>${t('source')}</h3><div class="meta">${esc(table.replace(/_/g, ' '))} · ${esc(id)}</div></div><button class="btn small" data-close>${t('close')}</button></div>
    <dl class="kv">${rows.map(([k, v]) => `<dt>${esc(keyName(k))}</dt><dd>${val(v)}</dd>`).join('')}</dl></div>`;
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
  if (!el) return;
  if (el.dataset.tab) { state.tab = el.dataset.tab; renderQueue(); return; }
  if (el.dataset.lang) { state.lang = el.dataset.lang; localSet('lang', state.lang); renderTop(); renderQueue(); renderDetail(); return; }
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
    if (o.danger && !confirm(`${L(o.label)}?`)) return;
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

// Links like /#CD-421105 open that order directly.
function openFromHash() {
  const o = state.data?.orders.find((x) => x.ref === decodeURIComponent(location.hash.slice(1)));
  if (!o) return false;
  state.tab = o.lane;
  openOrder(o.id);
  return true;
}
window.addEventListener('hashchange', () => openFromHash());

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
