// Synthetic order files for trying the upload. Fictional orders, dealers and drivers;
// real cities, routes and timetables. Dates are written relative to the moment the file is
// made (local Helsinki time), so a sample is always current when someone downloads it.
const pad = (n) => String(n).padStart(2, '0');
function localStamp(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
// Day offset at a local hour ("tomorrow 09:00"), or hours from now.
const dayAt = (now, days, hhmm) => {
  const today = localStamp(now).slice(0, 10);
  const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return `${d.toISOString().slice(0, 10)} ${hhmm}`;
};
const ago = (now, h) => localStamp(now - h * 3600e3);
const ahead = (now, h) => localStamp(now + h * 3600e3);

const HEAD = ['ref', 'pickup_city', 'pickup_country', 'delivery_city', 'delivery_country', 'pickup_at', 'deliver_by', 'status', 'car', 'fuel', 'driver', 'driver_on_time_pct', 'driver_claims_12m', 'last_driver_contact', 'ferry_booked', 'pickup_confirmed', 'receiver_named', 'notes'];
const csvCell = (v) => (v == null ? '' : /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const toCsv = (rows, head = HEAD, sep = ',') => [head.join(sep), ...rows.map((r) => head.map((h) => csvCell(r[h])).join(sep))].join('\n') + '\n';

function nordic(now) {
  const T = (d, h) => dayAt(now, d, h);
  return [
    { ref: 'NO-1001', pickup_city: 'Helsinki', pickup_country: 'FI', delivery_city: 'Tampere', delivery_country: 'FI', pickup_at: T(1, '09:00'), deliver_by: T(1, '17:00'), status: 'planned', car: 'Toyota RAV4', fuel: 'hybrid', driver: 'Aino Lehtovaara', driver_on_time_pct: 96, driver_claims_12m: 0, ferry_booked: '', pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'NO-1002', pickup_city: 'Tallinn', pickup_country: 'EE', delivery_city: 'Helsinki', delivery_country: 'FI', pickup_at: T(1, '10:00'), deliver_by: T(1, '19:00'), status: 'planned', car: 'Skoda Octavia', fuel: 'petrol', driver: 'Mart Kivistik', driver_on_time_pct: 92, driver_claims_12m: 0, ferry_booked: 'no', pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'NO-1003', pickup_city: 'Espoo', pickup_country: 'FI', delivery_city: 'Oulu', delivery_country: 'FI', pickup_at: T(-1, '08:00'), deliver_by: T(0, '20:00'), status: 'in_transit', car: 'BMW X5', fuel: 'petrol', driver: 'Joonas Rantasalo', driver_on_time_pct: 88, driver_claims_12m: 1, last_driver_contact: ago(now, 14), ferry_booked: '', pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'NO-1004', pickup_city: 'Turku', pickup_country: 'FI', delivery_city: 'Kuopio', delivery_country: 'FI', pickup_at: ahead(now, 5), deliver_by: T(1, '18:00'), status: 'planned', car: 'Volvo XC60', fuel: 'hybrid', driver: '', pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'NO-1005', pickup_city: 'Helsinki', pickup_country: 'FI', delivery_city: 'Rovaniemi', delivery_country: 'FI', pickup_at: T(2, '08:00'), deliver_by: T(3, '16:00'), status: 'planned', car: 'Ford Ranger', fuel: 'diesel', driver: 'Eero Paldanius', driver_on_time_pct: 93, driver_claims_12m: 0, pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'NO-1006', pickup_city: 'Tampere', pickup_country: 'FI', delivery_city: 'Tallinn', delivery_country: 'EE', pickup_at: T(1, '07:00'), deliver_by: T(1, '14:30'), status: 'planned', car: 'Skoda Enyaq', fuel: 'electric', driver: 'Liisa Harjunpää', driver_on_time_pct: 94, driver_claims_12m: 0, ferry_booked: 'yes', pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'NO-1007', pickup_city: 'Oulu', pickup_country: 'FI', delivery_city: 'Helsinki', delivery_country: 'FI', pickup_at: T(1, '08:00'), deliver_by: T(1, '13:00'), status: 'planned', car: 'Audi A6', fuel: 'diesel', driver: 'Ville Saarnio', driver_on_time_pct: 90, driver_claims_12m: 0, pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'NO-1008', pickup_city: 'Jyväskylä', pickup_country: 'FI', delivery_city: 'Helsinki', delivery_country: 'FI', pickup_at: T(1, '12:00'), deliver_by: T(2, '12:00'), status: 'planned', car: 'Mercedes-Benz C 300', fuel: 'petrol', driver: 'Sanna Kettunen', driver_on_time_pct: 91, driver_claims_12m: 0, pickup_confirmed: 'yes', receiver_named: 'yes', notes: 'Dealer says the second key is still with the previous owner' },
    { ref: 'NO-1009', pickup_city: 'Pori', pickup_country: 'FI', delivery_city: 'Turku', delivery_country: 'FI', pickup_at: T(2, '10:00'), deliver_by: T(2, '18:00'), status: 'planned', car: 'Volkswagen Golf', fuel: 'petrol', driver: 'Mikko Aaltonen', driver_on_time_pct: 97, driver_claims_12m: 0, pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'NO-1010', pickup_city: 'Seinäjoki', pickup_country: 'FI', delivery_city: 'Helsinki', delivery_country: 'FI', pickup_at: T(1, '09:00'), deliver_by: T(2, '12:00'), status: 'planned', car: 'Porsche Macan', fuel: 'petrol', driver: 'Kalle Vuorimaa', driver_on_time_pct: 72, driver_claims_12m: 3, pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'NO-1011', pickup_city: 'Tartu', pickup_country: 'EE', delivery_city: 'Pärnu', delivery_country: 'EE', pickup_at: T(1, '11:00'), deliver_by: T(1, '18:00'), status: 'planned', car: 'Kia Sportage', fuel: 'hybrid', driver: 'Kadri Tamm', driver_on_time_pct: 95, driver_claims_12m: 0, pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'NO-1012', pickup_city: 'Kuopio', pickup_country: 'FI', delivery_city: 'Lahti', delivery_country: 'FI', pickup_at: ahead(now, 20), deliver_by: T(2, '16:00'), status: 'planned', car: 'Nissan Leaf', fuel: 'electric', driver: 'Petri Halonen', driver_on_time_pct: 89, driver_claims_12m: 1, pickup_confirmed: 'no', receiver_named: 'no', notes: '' },
  ];
}

function germanyDenmark(now) {
  const T = (d, h) => dayAt(now, d, h);
  return [
    { ref: 'DE-2001', pickup_city: 'Hamburg', pickup_country: 'DE', delivery_city: 'Copenhagen', delivery_country: 'DK', pickup_at: T(1, '08:00'), deliver_by: T(1, '18:00'), status: 'planned', car: 'Volvo XC90', fuel: 'hybrid', driver: 'Lena Hartwig', driver_on_time_pct: 95, driver_claims_12m: 0, pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'DE-2002', pickup_city: 'Munich', pickup_country: 'DE', delivery_city: 'Helsinki', delivery_country: 'FI', pickup_at: T(1, '07:00'), deliver_by: T(4, '12:00'), status: 'planned', car: 'BMW M4', fuel: 'petrol', driver: 'Tobias Engler', driver_on_time_pct: 91, driver_claims_12m: 0, ferry_booked: 'no', pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'DE-2003', pickup_city: 'Berlin', pickup_country: 'DE', delivery_city: 'Aarhus', delivery_country: 'DK', pickup_at: T(0, '06:00'), deliver_by: T(0, '20:00'), status: 'picked_up', car: 'Audi Q7', fuel: 'diesel', driver: 'Sven Albrecht', driver_on_time_pct: 90, driver_claims_12m: 1, last_driver_contact: ago(now, 7), pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'DE-2004', pickup_city: 'Frankfurt', pickup_country: 'DE', delivery_city: 'Cologne', delivery_country: 'DE', pickup_at: ago(now, 3), deliver_by: T(0, '21:00'), status: 'planned', car: 'Mercedes-Benz E 220', fuel: 'diesel', driver: 'Jana Kessler', driver_on_time_pct: 93, driver_claims_12m: 0, pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'DE-2005', pickup_city: 'Stuttgart', pickup_country: 'DE', delivery_city: 'Hamburg', delivery_country: 'DE', pickup_at: T(1, '07:00'), deliver_by: T(1, '20:00'), status: 'planned', car: 'Porsche Taycan', fuel: 'electric', driver: 'Felix Brandt', driver_on_time_pct: 94, driver_claims_12m: 0, pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'DE-2006', pickup_city: 'Düsseldorf', pickup_country: 'DE', delivery_city: 'Berlin', delivery_country: 'DE', pickup_at: T(1, '09:00'), deliver_by: T(1, '13:00'), status: 'planned', car: 'Volkswagen ID.4', fuel: 'electric', driver: 'Mia Lorenz', driver_on_time_pct: 92, driver_claims_12m: 0, pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'DE-2007', pickup_city: 'Odense', pickup_country: 'DK', delivery_city: 'Copenhagen', delivery_country: 'DK', pickup_at: T(2, '09:00'), deliver_by: T(2, '16:00'), status: 'planned', car: 'Peugeot 3008', fuel: 'hybrid', driver: 'Mads Kjeldsen', driver_on_time_pct: 96, driver_claims_12m: 0, pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'DE-2008', pickup_city: 'Leipzig', pickup_country: 'DE', delivery_city: 'Munich', delivery_country: 'DE', pickup_at: T(2, '08:00'), deliver_by: T(2, '18:00'), status: 'planned', car: 'Audi A4', fuel: 'petrol', driver: 'Paul Neumann', driver_on_time_pct: 97, driver_claims_12m: 0, pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
    { ref: 'DE-2009', pickup_city: 'Hamburg', pickup_country: 'DE', delivery_city: 'Aarhus', delivery_country: 'DK', pickup_at: T(1, '10:00'), deliver_by: T(1, '19:00'), status: 'planned', car: 'Tesla Model Y', fuel: 'electric', driver: 'Nils Ottesen', driver_on_time_pct: 90, driver_claims_12m: 0, pickup_confirmed: 'yes', receiver_named: 'yes', notes: 'Customer site closed on Monday afternoon, deliver before 14:00' },
    { ref: 'DE-2010', pickup_city: 'Cologne', pickup_country: 'DE', delivery_city: 'Antwerp', delivery_country: 'BE', pickup_at: T(3, '08:00'), deliver_by: T(3, '17:00'), status: 'planned', car: 'Ford Kuga', fuel: 'hybrid', driver: '', pickup_confirmed: 'yes', receiver_named: 'yes', notes: '' },
  ];
}

// A realistic messy export: semicolons, other column names, gaps and mistakes.
function messy(now) {
  const T = (d, h) => dayAt(now, d, h);
  const head = ['reference', 'from', 'from_country', 'to', 'to_country', 'pickup', 'deadline', 'status', 'vehicle', 'fuel', 'driver_name', 'last_contact', 'ferry', 'sales_rep', 'comments'];
  const rows = [
    { reference: 'MX-3001', from: 'Helsinki', from_country: 'FI', to: 'Turku', to_country: 'FI', pickup: T(1, '09:00'), deadline: T(1, '15:00'), status: 'planned', vehicle: 'Toyota Corolla', fuel: 'hybrid', driver_name: 'Anna Virta', sales_rep: 'J. Mäki', comments: '' },
    { reference: 'MX-3002', from: 'Tampere', from_country: '', to: 'Helsinki', to_country: 'FI', pickup: T(1, '10:00'), deadline: T(1, '16:00'), status: 'planned', vehicle: 'Volvo V60', fuel: 'petrol', driver_name: 'Ossi Laine', sales_rep: 'J. Mäki', comments: 'country missing in export' },
    { reference: 'MX-3003', from: 'Lahti', from_country: 'FI', to: 'Kuopio', to_country: 'FI', pickup: 'next Tuesday', deadline: T(3, '18:00'), status: 'planned', vehicle: 'Mazda CX-5', fuel: 'petrol', driver_name: 'Pia Nurmi', sales_rep: 'K. Salo', comments: '' },
    { reference: 'MX-3001', from: 'Espoo', from_country: 'FI', to: 'Tampere', to_country: 'FI', pickup: T(2, '08:00'), deadline: T(2, '14:00'), status: 'planned', vehicle: 'Kia Niro', fuel: 'electric', driver_name: 'Timo Kallio', sales_rep: 'K. Salo', comments: 'duplicate reference' },
    { reference: 'MX-3005', from: 'Helsinki', from_country: 'FI', to: 'Kemi', to_country: 'FI', pickup: T(2, '07:00'), deadline: T(3, '12:00'), status: 'planned', vehicle: 'Skoda Kodiaq', fuel: 'diesel', driver_name: 'Juha Peltonen', sales_rep: 'J. Mäki', comments: '' },
    { reference: 'MX-3006', from: 'Tallinn', from_country: 'EE', to: 'Espoo', to_country: 'FI', pickup: T(1, '13:00'), deadline: T(1, '20:00'), status: 'planned', vehicle: 'Hyundai Ioniq 5', fuel: 'electric', driver_name: 'Rein Saar', ferry: 'yes', sales_rep: 'K. Salo', comments: 'papers not ready yet' },
  ];
  return toCsv(rows, head, ';');
}

export const SAMPLES = {
  'template.csv': { title: { en: 'Column template', fi: 'Sarakepohja' }, build: (now) => toCsv(nordic(now).slice(0, 1)) },
  'nordic-week.csv': { title: { en: 'Finland and Estonia, 12 orders', fi: 'Suomi ja Viro, 12 tilausta' }, build: (now) => toCsv(nordic(now)) },
  'germany-denmark.csv': { title: { en: 'Germany and Denmark, 10 orders', fi: 'Saksa ja Tanska, 10 tilausta' }, build: (now) => toCsv(germanyDenmark(now)) },
  'messy-export.csv': { title: { en: 'A messy export (semicolons, gaps, mistakes)', fi: 'Sotkuinen vienti (puolipisteet, puutteet, virheet)' }, build: messy },
  'orders.json': { title: { en: 'Finland and Estonia as JSON (for the API)', fi: 'Suomi ja Viro JSON-muodossa (rajapintaa varten)' }, build: (now) => JSON.stringify({ orders: nordic(now) }, null, 2) },
};
export const sampleList = () => Object.entries(SAMPLES).map(([name, s]) => ({ name, title: s.title }));
