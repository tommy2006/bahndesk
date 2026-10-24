// Turns a source record into something a dispatcher can read: a title, plain facts
// in Helsinki time, and the original wording where it matters. Internal IDs, codes and
// field names stay out of sight (the raw record is still available on request).
import { db } from './data.mjs';

const t2 = (en, fi) => ({ en, fi: fi ?? en });
const when = (iso, lang) => (iso ? new Date(iso).toLocaleString(lang === 'fi' ? 'fi-FI' : 'en-GB', { timeZone: 'Europe/Helsinki', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null);
const at = (iso) => (iso ? t2(when(iso, 'en'), when(iso, 'fi')) : null);
const words = (code) => (code ? String(code).toLowerCase().replace(/_/g, ' ') : null);
const eur = (cents) => (cents != null ? `€${Math.round(cents / 100)}` : null);

const STATUS = {
  OPEN: ['open', 'avoin'], ACKNOWLEDGED: ['seen by the team', 'tiimi on nähnyt'], RESOLVED: ['resolved', 'ratkaistu'],
  INVESTIGATING: ['being investigated', 'selvitetään'], NEEDS_HUMAN: ['needs a person', 'tarvitsee ihmisen'], AWAITING_DECISION: ['waiting for a decision', 'odottaa päätöstä'],
  CONFIRMED: ['confirmed', 'vahvistettu'], UNCONFIRMED: ['not confirmed', 'ei vahvistettu'], NEEDS_VERIFICATION: ['needs checking', 'tarkistettava'],
  BOOKED: ['booked', 'varattu'], MISSED_CHECK_IN: ['check-in missed', 'lähtöselvitys myöhästyi'], CANCELLED: ['cancelled', 'peruttu'],
  ASSIGNED: ['driver booked', 'kuljettaja varattu'], IN_PROGRESS: ['on the road', 'matkalla'], COMPLETED: ['completed', 'valmis'],
  PUBLISHED: ['open to drivers', 'avoinna kuljettajille'], ACCEPTED: ['taken by a driver', 'kuljettaja otti'], WITHDRAWN: ['withdrawn', 'peruttu'],
  PENDING_REVIEW: ['waiting for review', 'odottaa tarkistusta'], APPROVED_AWAITING_EXECUTION: ['approved, not yet done', 'hyväksytty, ei vielä tehty'],
  EXECUTED: ['done', 'tehty'], REJECTED: ['rejected', 'hylätty'], FAILED: ['failed', 'epäonnistui'],
  NEW: ['new', 'uusi'], WAITING_FOR_PICKUP: ['waiting for pickup', 'odottaa noutoa'], IN_TRANSIT: ['on the road', 'matkalla'], DELIVERED: ['delivered', 'toimitettu'],
  high: ['high', 'korkea'], medium: ['medium', 'keskitaso'], low: ['low', 'matala'],
};
const status = (code) => (code ? (STATUS[code] ? t2(...STATUS[code]) : t2(words(code))) : null);
const WHO = {
  driver: ['the driver', 'kuljettaja'], customer: ['the customer', 'asiakas'], operator: ['Bahn operations', 'Bahnin operatiivinen tiimi'],
  agent: ['an agent', 'agentti'], site_contact: ['the pickup or delivery site', 'nouto- tai toimituspaikka'], handoff_contact: ['the handover contact', 'luovutuksen yhteyshenkilö'], system: ['Bahn systems', 'Bahnin järjestelmä'],
};
const TEAM = {
  'ops-dispatch': ['Dispatch', 'Ajojärjestely'], 'ops-evidence': ['Damage and evidence', 'Vauriot ja todisteet'], 'ops-readiness': ['Pickup readiness', 'Noudon valmistelu'],
  'ops-shift': ['Shift lead', 'Vuoroesimies'], 'ops-support': ['Customer support', 'Asiakastuki'],
};
const team = (code) => (TEAM[code] ? t2(...TEAM[code]) : t2(words(code).replace(/^ops-/, '')));
const who = (type) => (WHO[type] ? t2(...WHO[type]) : t2(words(type)));
const PURPOSE = {
  SELECTED_PICKUP_SLOT: ['Pickup slot', 'Noutoaika'], PICKUP_AVAILABILITY: ['Car available for pickup', 'Auto noudettavissa'],
  REQUESTED_PICKUP_SLOT: ['Pickup time the customer asked for', 'Asiakkaan toivoma noutoaika'], CUSTOMER_DELIVERY_PROMISE: ['Delivery window promised to the customer', 'Asiakkaalle luvattu toimitusikkuna'],
  REQUESTED_DELIVERY_SLOT: ['Delivery time the customer asked for', 'Asiakkaan toivoma toimitusaika'], SELECTED_DELIVERY_SLOT: ['Agreed delivery slot', 'Sovittu toimitusaika'],
};
const KIND = { FERRY: ['Ferry booking', 'Lauttavaraus'], TRAIN: ['Train ticket for the driver', 'Kuljettajan junalippu'], FLIGHT: ['Flight for the driver', 'Kuljettajan lento'], HOTEL: ['Hotel night for the driver', 'Kuljettajan hotelliyö'], BUS: ['Bus ticket for the driver', 'Kuljettajan bussilippu'], TAXI: ['Taxi for the driver', 'Kuljettajan taksi'] };

function fact(label, value, opts = {}) {
  if (value == null || value === '' || (typeof value === 'object' && !value.en)) return null;
  return { label, value: typeof value === 'string' ? t2(value) : value, ...opts };
}
const city = (addrId) => db.addresses[addrId]?.city;
const driverName = (id) => db.drivers[id]?.display_name;

// Hidden from the plain view: IDs, references between records, and machine-only fields.
const isTechnical = (k, v) => k === 'id' || /_ids?$/.test(k) || /^(evidence_refs|dependency|execution|review|proposed_payload|journey_state_basis|schedule_basis|verified_milestones|changes|source_refs|related_record_ids|sample_tier|synthetic_vin|registration|display_lane|interpretation_note|segment_ids|lines)$/.test(k)
  || (typeof v === 'string' && /^(ord|asg|evt|msg|conv|seg|point|plan|item|veh|addr|site|offer|alert|incident|work|proof|res|travel|track|win|ep|eclaim|cus|drv|agent|reach|doc|exp)-[\w-]+$/i.test(v));

const generic = (rec) => Object.entries(rec || {}).filter(([k, v]) => v != null && v !== '' && typeof v !== 'object' && !isTechnical(k, v))
  .map(([k, v]) => fact(t2(k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())), /\d{4}-\d\d-\d\dT/.test(String(v)) ? at(v) : STATUS[v] ? status(v) : t2(String(v).length < 40 && /^[A-Z_]+$/.test(String(v)) ? words(v) : String(v)))).filter(Boolean);

// One explanation per record type. `fiOf` translates dataset wording for the Finnish view.
export function explain(table, rec, fiOf = () => null) {
  if (!rec || rec.error) return null;
  const tr = (s) => (s ? t2(s, fiOf(s) || s) : null);
  const quote = (s) => (s ? { en: s, fi: s } : null); // what someone actually wrote stays as written
  let title, intro, facts;
  switch (table) {
    case 'alerts':
      title = t2('Alert from Bahn’s monitoring', 'Bahnin seurannan hälytys');
      intro = tr(rec.summary);
      facts = [fact(t2('Raised', 'Nostettu'), at(rec.triggered_at)), fact(t2('Status', 'Tila'), status(rec.status)), fact(t2('Urgency', 'Kiireellisyys'), status(rec.severity)), fact(t2('Handled by', 'Käsittelijä'), rec.owner ? team(rec.owner) : null)];
      break;
    case 'incidents':
      title = t2('Incident on this delivery', 'Poikkeama tässä toimituksessa');
      intro = tr(rec.reported_symptom || words(rec.kind));
      facts = [fact(t2('What happened', 'Mitä tapahtui'), tr(words(rec.kind))), fact(t2('Opened', 'Avattu'), at(rec.opened_at)), fact(t2('Status', 'Tila'), status(rec.status)),
        fact(t2('Where the driver says they are', 'Kuljettajan ilmoittama paikka'), tr(rec.reported_stop_text)), fact(t2('Location checked', 'Sijainti tarkistettu'), rec.location_verified === false ? t2('no, as reported by the driver', 'ei, kuljettajan ilmoitus') : null),
        fact(t2('Waiting on', 'Odottaa'), rec.recovery_decision ? tr(words(rec.recovery_decision)) : null), fact(t2('Resolved', 'Ratkaistu'), at(rec.resolved_at))];
      break;
    case 'work_items':
      title = t2('Task for the operations team', 'Tehtävä operatiiviselle tiimille');
      intro = tr(rec.summary);
      facts = [fact(t2('What to do', 'Mitä tehdä'), tr(rec.next_action)), fact(t2('Due', 'Määräaika'), at(rec.due_at)), fact(t2('Priority', 'Prioriteetti'), status(rec.priority)), fact(t2('Status', 'Tila'), status(rec.status)), fact(t2('Team', 'Tiimi'), rec.owner ? team(rec.owner) : null)];
      break;
    case 'messages': {
      title = t2(`Message from ${who(rec.author_type).en}`, `Viesti: ${who(rec.author_type).fi}`);
      intro = quote(rec.body);
      facts = [fact(t2('Sent', 'Lähetetty'), at(rec.authored_at)), fact(t2('To', 'Vastaanottaja'), who(rec.recipient_type)), fact(t2('Channel', 'Kanava'), t2(words(rec.channel)))];
      break;
    }
    case 'tracking_observations':
      title = t2('Position report from the driver app', 'Sijaintitieto kuljettajan sovelluksesta');
      facts = [fact(t2('Reported', 'Ilmoitettu'), at(rec.observed_at)), fact(t2('Distance left', 'Matkaa jäljellä'), rec.distance_remaining_km != null ? t2(`${rec.distance_remaining_km} km`) : null),
        fact(t2('Progress', 'Edistyminen'), rec.progress_fraction != null ? t2(`${Math.round(rec.progress_fraction * 100)} %`) : null), fact(t2('App’s arrival estimate', 'Sovelluksen saapumisarvio'), at(rec.estimated_delivery_at)),
        fact(t2('Accuracy', 'Tarkkuus'), rec.location_quality === 'COARSE' ? t2('approximate', 'likimääräinen') : null)];
      break;
    case 'travel_reservations':
      title = KIND[rec.kind] ? t2(...KIND[rec.kind]) : t2('Travel booking', 'Matkavaraus');
      intro = rec.route_label ? tr(rec.route_label) : null;
      facts = [fact(t2('Operator', 'Varustamo'), rec.provider ? t2(rec.provider) : t2('not named in the booking', 'ei nimetty varauksessa')), fact(t2('Departs', 'Lähtee'), at(rec.departure_at)), fact(t2('Arrives', 'Saapuu'), at(rec.expected_arrival_at)),
        fact(t2('Check-in closes', 'Lähtöselvitys sulkeutuu'), at(rec.check_in_cutoff_at)), fact(t2('Checked in', 'Lähtöselvitys tehty'), status(rec.check_in_confirmation)), fact(t2('Booking', 'Varaus'), status(rec.status)), fact(t2('Booked', 'Varattu'), at(rec.booked_at))];
      break;
    case 'order_endpoint_details':
      title = rec.boundary === 'PICKUP' ? t2('Pickup instructions', 'Nouto-ohjeet') : t2('Delivery instructions', 'Toimitusohjeet');
      intro = tr(rec.access_instruction);
      facts = [fact(t2('Place', 'Paikka'), t2(city(rec.address_id) || '')), fact(t2('Contact', 'Yhteyshenkilö'), rec.contact_name ? t2(`${rec.contact_name}${rec.contact_role ? ` (${rec.contact_role})` : ''}`) : null),
        fact(t2('Contact confirmed', 'Yhteyshenkilö vahvistettu'), status(rec.contact_status)), fact(t2('Access confirmed', 'Pääsy vahvistettu'), status(rec.access_status)), fact(t2('Last confirmed', 'Viimeksi vahvistettu'), at(rec.last_confirmed_at))];
      break;
    case 'endpoint_claims':
      title = t2('Conflicting statement', 'Ristiriitainen tieto');
      intro = quote(rec.claim);
      facts = [fact(t2('About', 'Koskee'), tr(words(rec.field))), fact(t2('Recorded', 'Kirjattu'), at(rec.recorded_at)), fact(t2('Outcome', 'Lopputulos'), rec.resolution_status ? tr(words(rec.resolution_status)) : t2('still open', 'yhä avoin'))];
      break;
    case 'agent_proposals':
      title = t2('Suggestion from Bahn’s existing agent', 'Bahnin nykyisen agentin ehdotus');
      intro = tr(rec.summary);
      facts = [fact(t2('Why', 'Miksi'), tr(rec.rationale)), fact(t2('Made', 'Tehty'), at(rec.created_at)), fact(t2('Status', 'Tila'), status(rec.status))];
      break;
    case 'work_assignments':
      title = t2('Driver booking', 'Kuljettajavaraus');
      facts = [fact(t2('Driver', 'Kuljettaja'), t2(driverName(rec.driver_id) || '')), fact(t2('Status', 'Tila'), status(rec.status)), fact(t2('Accepted', 'Hyväksytty'), at(rec.accepted_at)),
        fact(t2('Picked up', 'Noudettu'), at(rec.started_at)), fact(t2('Delivered', 'Toimitettu'), at(rec.completed_at)), fact(t2('Cancelled', 'Peruttu'), at(rec.cancelled_at)), fact(t2('Driver fee', 'Kuljettajan palkkio'), t2(eur(rec.fee_cents) || ''))];
      break;
    case 'market_offers':
      title = t2('Job offered to drivers', 'Kuljettajille tarjottu keikka');
      facts = [fact(t2('Status', 'Tila'), status(rec.status)), fact(t2('Driver fee', 'Kuljettajan palkkio'), t2(eur(rec.fee_cents) || '')), fact(t2('Published', 'Julkaistu'), at(rec.published_at)), fact(t2('Expires', 'Vanhenee'), at(rec.expires_at)), fact(t2('Taken', 'Otettu'), at(rec.accepted_at))];
      break;
    case 'time_windows':
      title = PURPOSE[rec.purpose] ? t2(...PURPOSE[rec.purpose]) : t2('Time window', 'Aikaikkuna');
      facts = [fact(t2('From', 'Alkaen'), at(rec.start_at)), fact(t2('Until', 'Asti'), at(rec.end_at)), fact(t2('Set by', 'Asettaja'), rec.source === 'CUSTOMER' ? t2('the customer', 'asiakas') : rec.source === 'OPS' ? t2('Bahn operations', 'Bahnin operatiivinen tiimi') : t2(words(rec.source)))];
      break;
    case 'orders':
      title = t2(`Order ${rec.reference}`, `Tilaus ${rec.reference}`);
      facts = [fact(t2('Status', 'Tila'), status(rec.status)), fact(t2('Ready for pickup', 'Valmis noudettavaksi'), status(rec.readiness_status)), fact(t2('Created', 'Luotu'), at(rec.created_at)), fact(t2('Last update', 'Viimeksi päivitetty'), at(rec.updated_at))];
      break;
    case 'operational_events':
      title = t2('Recorded event', 'Kirjattu tapahtuma');
      intro = tr(words(rec.command)?.replace(/\./g, ' '));
      facts = [fact(t2('When', 'Milloin'), at(rec.recorded_at)), fact(t2('By', 'Kuka'), who(rec.actor_type)), fact(t2('Change', 'Muutos'), rec.from_state || rec.to_state ? t2(`${words(rec.from_state) || '—'} → ${words(rec.to_state) || '—'}`) : null)];
      break;
    default:
      title = null;
      facts = generic(rec);
  }
  return { title, intro, facts: (facts || []).filter(Boolean) };
}
