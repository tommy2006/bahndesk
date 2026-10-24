"""Build data/vehicle_consumption.json from the EEA CO2-cars dataset (DiscoData SQL API, no key).

One row per (make, model, fuel) in the challenge dataset, using the latest registration
year with data. Re-run any time; results are cached so the app never has to look them up live.
"""
import json, sys, urllib.parse, urllib.request
from pathlib import Path

API = "https://discodata.eea.europa.eu/sql?query="
TABLE = "[CO2Emission].[latest].[co2cars]"
OUT = Path(__file__).resolve().parent.parent / "data" / "vehicle_consumption.json"

# dataset make/model/fuel -> EEA make + commercial-name SQL pattern
MODELS = [
    ("Audi", "Q5", "hybrid", "AUDI", "%Q5%"),
    ("Audi", "Q8 e-tron", "electric", "AUDI", "%Q8%E-TRON%"),
    ("Audi", "RS 6", "petrol", "AUDI", "%RS%6%"),
    ("BMW", "5 Series", "hybrid", "BMW", "5%"),
    ("BMW", "M4", "petrol", "BMW", "%M4%"),
    ("BMW", "X5", "hybrid", "BMW", "%X5%"),
    ("BMW", "i4", "electric", "BMW", "%I4%"),
    ("BMW", "i5", "electric", "BMW", "%I5%"),
    ("Bentley", "Continental GT", "petrol", "BENTLEY", "%CONTINENTAL%"),
    ("Bentley", "Flying Spur", "petrol", "BENTLEY", "%FLYING%SPUR%"),
    ("Ferrari", "296 GTB", "hybrid", "FERRARI", "%296%"),
    ("Ferrari", "Roma", "petrol", "FERRARI", "%ROMA%"),
    ("Mercedes-Benz", "C-Class", "hybrid", "MERCEDES-BENZ", "C %"),
    ("Mercedes-Benz", "E-Class", "hybrid", "MERCEDES-BENZ", "E %"),
    ("Mercedes-Benz", "EQE", "electric", "MERCEDES-BENZ", "%EQE%"),
    ("Mercedes-Benz", "GLC", "hybrid", "MERCEDES-BENZ", "%GLC%"),
    ("Mercedes-Benz", "S-Class", "hybrid", "MERCEDES-BENZ", "S %"),
    ("Mercedes-Benz", "S-Class", "petrol", "MERCEDES-BENZ", "S %"),
    ("Polestar", "2", "electric", "POLESTAR", "%2%"),
    ("Porsche", "911 Carrera", "petrol", "PORSCHE", "%911%"),
    ("Porsche", "Macan", "petrol", "PORSCHE", "%MACAN%"),
    ("Porsche", "Panamera", "hybrid", "PORSCHE", "%PANAMERA%"),
    ("Porsche", "Taycan", "electric", "PORSCHE", "%TAYCAN%"),
    ("Skoda", "Enyaq", "electric", "SKODA", "%ENYAQ%"),
    ("Skoda", "Octavia", "petrol", "SKODA", "%OCTAVIA%"),
    ("Tesla", "Model 3", "electric", "TESLA", "%MODEL 3%"),
    ("Tesla", "Model Y", "electric", "TESLA", "%MODEL Y%"),
    ("Toyota", "Corolla", "hybrid", "TOYOTA", "%COROLLA%"),
    ("Toyota", "RAV4", "hybrid", "TOYOTA", "%RAV%4%"),
    ("Volkswagen", "Golf", "petrol", "VOLKSWAGEN", "%GOLF%"),
    ("Volkswagen", "ID.4", "electric", "VOLKSWAGEN", "%ID%4%"),
    ("Volvo", "V60", "hybrid", "VOLVO", "%V60%"),
]

# EEA fuel type (Ft) / fuel mode (Fm: H = hybrid, P = plug-in) filter per dataset fuel
FUEL_SQL = {
    "petrol": "Ft = 'PETROL' AND Fm NOT IN ('H','P')",
    "electric": "Ft = 'ELECTRIC'",
    "hybrid": "Fm IN ('H','P')",
}
# Typical extra consumption in Finnish winter (sub-zero, heating, winter tyres)
WINTER_FACTOR = {"electric": 1.30, "hybrid": 1.20, "petrol": 1.12}


def query(sql, page=None, size=None):
    # DiscoData rejects OFFSET/FETCH; it pages with its own p / nrOfHits parameters
    url = API + urllib.parse.quote(sql) + (f"&p={page}&nrOfHits={size}" if page else "")
    with urllib.request.urlopen(url, timeout=120) as r:
        return json.load(r)["results"]


def lookup(make, pattern, fuel):
    sql = f"""
        SELECT Year, COUNT(*) AS n,
               AVG(CAST(Fc AS float)) AS fc, AVG(CAST([Z (Wh/km)] AS float)) AS wh,
               AVG(CAST([Ewltp (g/km)] AS float)) AS co2, AVG(CAST([M (kg)] AS float)) AS mass,
               SUM(CASE WHEN Fm = 'P' THEN 1 ELSE 0 END) AS plugin
        FROM {TABLE}
        WHERE Mk = '{make}' AND Cn LIKE '{pattern}' AND {FUEL_SQL[fuel]}
        GROUP BY Year ORDER BY Year DESC"""
    rows = [r for r in query(sql) if r["n"] >= 5]
    return rows[0] if rows else None


def main():
    table = []
    for make, model, fuel, eea_make, pattern in MODELS:
        r = lookup(eea_make, pattern, fuel)
        entry = {"make": make, "model": model, "fuel": fuel}
        if r:
            plugin_share = r["plugin"] / r["n"]
            # EEA rows carry stray values: fuel figures on EVs, Wh/km on petrol and self-charging hybrids
            fc = round(r["fc"], 1) if r["fc"] and fuel != "electric" else None
            wh = round(r["wh"]) if r["wh"] and (fuel == "electric" or plugin_share >= 0.5) else None
            entry.update({
                "fuel_l_per_100km": fc,
                "energy_wh_per_km": wh,
                "co2_g_per_km": round(r["co2"]) if r["co2"] is not None else None,
                "mass_kg": round(r["mass"]) if r["mass"] else None,
                "plugin_share": round(plugin_share, 2),
                "winter_factor": WINTER_FACTOR[fuel],
                "source": f"EEA CO2 cars, registration year {r['Year']}, {r['n']} registrations, WLTP averages",
                "eea_match": f"Mk={eea_make}, Cn LIKE {pattern}",
            })
        else:
            entry["source"] = "NOT_FOUND"
        if entry.get("fuel_l_per_100km") is None and entry.get("energy_wh_per_km") is None:
            # Missing from EEA: the agent looks it up once on first use and saves it here
            entry["needs_lookup"] = True
        table.append(entry)
        print(f"{make} {model} ({fuel}): {entry.get('fuel_l_per_100km')} L/100km, "
              f"{entry.get('energy_wh_per_km')} Wh/km - {entry['source']}", flush=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(table, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT}")


def build_all(page=5000):
    """Every EEA make/commercial name/fuel group with >= 20 registrations -> vehicle_consumption_all.json."""
    out = OUT.with_name("vehicle_consumption_all.json")
    rows, p = [], 1
    while True:
        sql = f"""
            SELECT Mk AS make, Cn AS model, Ft AS fuel_type, COUNT(*) AS n,
                   ROUND(AVG(CAST(Fc AS float)), 1) AS fuel_l_per_100km,
                   ROUND(AVG(CAST([Z (Wh/km)] AS float)), 0) AS energy_wh_per_km,
                   ROUND(AVG(CAST([Ewltp (g/km)] AS float)), 0) AS co2_g_per_km,
                   ROUND(AVG(CAST([M (kg)] AS float)), 0) AS mass_kg,
                   ROUND(AVG(CASE WHEN Fm = 'P' THEN 1.0 ELSE 0.0 END), 2) AS plugin_share
            FROM {TABLE}
            WHERE Mk IS NOT NULL AND Cn IS NOT NULL
            GROUP BY Mk, Cn, Ft HAVING COUNT(*) >= 20"""
        batch = query(sql, p, page)
        rows += batch
        print(f"fetched {len(rows)}", flush=True)
        if len(batch) < page:
            break
        p += 1
    for r in rows:
        if r["fuel_type"] == "ELECTRIC":
            r["fuel_l_per_100km"] = None
        elif r["plugin_share"] < 0.5:
            r["energy_wh_per_km"] = None
    out.write_text(json.dumps({"source": "EEA CO2 emissions from new passenger cars (latest), WLTP averages",
                               "rows": rows}, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out} ({len(rows)} rows)")


if __name__ == "__main__":
    sys.exit(build_all() if "--all" in sys.argv else main())
