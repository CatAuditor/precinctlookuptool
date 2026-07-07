#!/usr/bin/env python3
"""
build_master.py — concatenate every tier's candidate CSV into all_candidates.csv,
the single file to import into the Candidates sheet.

Sources (each must share the Candidates schema; missing files are skipped):
  2026_candidates_merged.csv  — STATE tier (rebuild via build_state_candidates.py)
  county_incumbents.csv       — COUNTY incumbents
  county_challengers.csv      — COUNTY challengers (optional, grows over time)

After concatenation, enrichments.csv (if present) overlays hand-verified field
values — currently Website — onto matching rows, keyed by (DistrictType,
District, candidate surname). This keeps enrichment data out of the generated
state file so a pipeline rerun never wipes it.

County rows (DistrictType=county) never collide with state rows, so this is a
clean concat; exact-duplicate rows are dropped defensively.

Usage:  python3 scripts/build_master.py
"""
import csv, os, re
from collections import Counter

SOURCES = ["2026_candidates_merged.csv", "county_incumbents.csv", "county_challengers.csv"]
ENRICHMENTS = "enrichments.csv"
OUT = "all_candidates.csv"

def surname(name):
    toks = [t for t in re.sub(r"[^\w\s]", " ", name.lower()).split() if len(t) > 1]
    return toks[-1] if toks else name.lower()

def apply_enrichments(rows):
    if not os.path.exists(ENRICHMENTS):
        return 0
    idx = {}
    for r in rows:
        idx.setdefault((r["DistrictType"], r["District"], surname(r["Name"])), []).append(r)
    applied = 0
    with open(ENRICHMENTS, newline="") as f:
        for e in csv.DictReader(f):
            matches = idx.get((e["DistrictType"], e["District"].strip(), e["NameKey"].strip().lower()), [])
            if len(matches) != 1:
                print(f"  ! enrichment skipped ({len(matches)} matches): {e['DistrictType']} D{e['District']} {e['NameKey']}")
                continue
            if e.get("Website"):
                matches[0]["Website"] = e["Website"].strip()
                applied += 1
    return applied

def main():
    header = None
    seen = set()
    rows = []
    used = []
    for src in SOURCES:
        if not os.path.exists(src):
            continue
        with open(src, newline="") as f:
            r = csv.DictReader(f)
            if header is None:
                header = r.fieldnames
            elif r.fieldnames != header:
                raise SystemExit(f"schema mismatch in {src}:\n  {r.fieldnames}\n!= {header}")
            n = 0
            for row in r:
                key = tuple(row.get(c, "") for c in header)
                if key in seen:
                    continue
                seen.add(key); rows.append(row); n += 1
            used.append((src, n))

    enriched = apply_enrichments(rows)

    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader(); w.writerows(rows)

    print(f"wrote {OUT}: {len(rows)} rows from " + ", ".join(f"{s} ({n})" for s, n in used))
    print(f"  enrichments applied: {enriched}")
    print("  by DistrictType:", dict(Counter(r["DistrictType"] for r in rows)))
    print("  incumbents:", sum(1 for r in rows if r.get("Incumbent", "").strip().upper() == "TRUE"),
          "| challengers:", sum(1 for r in rows if r.get("Incumbent", "").strip().upper() == "FALSE"))
    print("  status:", dict(Counter(r.get("Status", "").split(" |")[0].split(" —")[0] for r in rows)))

if __name__ == "__main__":
    main()
