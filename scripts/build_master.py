#!/usr/bin/env python3
"""
build_master.py — concatenate every tier's candidate CSV into all_candidates.csv,
the single file to import into the Candidates sheet.

Sources (each must share the Candidates schema; missing files are skipped):
  2026_candidates_merged.csv  — STATE tier (rebuild via build_state_candidates.py)
  county_incumbents.csv       — COUNTY incumbents
  county_challengers.csv      — COUNTY challengers (optional, grows over time)

County rows (DistrictType=county) never collide with state rows, so this is a
clean concat; exact-duplicate rows are dropped defensively.

Usage:  python3 scripts/build_master.py
"""
import csv, os
from collections import Counter

SOURCES = ["2026_candidates_merged.csv", "county_incumbents.csv", "county_challengers.csv"]
OUT = "all_candidates.csv"

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

    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header)
        w.writeheader(); w.writerows(rows)

    print(f"wrote {OUT}: {len(rows)} rows from " + ", ".join(f"{s} ({n})" for s, n in used))
    print("  by DistrictType:", dict(Counter(r["DistrictType"] for r in rows)))
    print("  incumbents:", sum(1 for r in rows if r.get("Incumbent", "").strip().upper() == "TRUE"),
          "| challengers:", sum(1 for r in rows if r.get("Incumbent", "").strip().upper() == "FALSE"))
    print("  status:", dict(Counter(r.get("Status", "").split(" |")[0].split(" —")[0] for r in rows)))

if __name__ == "__main__":
    main()
