# Google Sheet templates

Import these into two Google spreadsheets so the tabs + headers match the code.
Importing a CSV names the new tab after the file, which is exactly what the app
expects (`Candidates`, `Config`, `Submissions`).

## 1. Candidate spreadsheet

1. Create a new Google Sheet. Name it e.g. "Precinct Tool — Candidates".
2. **File → Import → Upload →** `Candidates.csv`.
3. Import location: **Replace current sheet**. (Then rename the tab to `Candidates`
   if it isn't already.)
4. Delete the sample rows once you've added real candidates.
5. Copy its Sheet ID (URL between `/d/` and `/edit`) → `CANDIDATE_SHEET_ID`.

All candidates live in this one tab regardless of office — the app filters each
voter's races by the `DistrictType` + `District` columns. Group the rows by
`DistrictType` (congress → senate → house → school_board → school_district) to
keep it readable; the template is already laid out that way and ships one sample
row per type. Adding a brand-new office type later is just a new `DistrictType`
value — no code change.

`DistrictType` must be one of: `congress`, `senate`, `house`, `school_board`,
`school_district`. `District` must equal what the map returns for that type: a
**number** for congress/senate/house/school_board (e.g. `10`), and the **district
name** for `school_district` (e.g. `Granite`). `TopIssues` is comma-separated in
one cell. `Active` = TRUE/FALSE. Share this sheet with the service account as
**Viewer**.

For `school_district`, the name match is case/whitespace-insensitive, so
capitalization doesn't have to be perfect. The valid Utah district names are
(verified against the live GIS layer, 2026-07-01):

> Alpine, Beaver County, Box Elder, Cache County, Canyons, Carbon County,
> Daggett County, Davis County, Duchesne County, Emery County, Garfield County,
> Grand County, Granite, Iron County, Jordan, Juab County, Kane County,
> Logan City, Millard County, Morgan County, Murray City, Nebo, North Sanpete,
> North Summit, Ogden City, Park City, Piute County, Provo City, Rich County,
> Salt Lake City, San Juan County, Sevier County, South Sanpete, South Summit,
> Tintic, Tooele County, Uintah County, Wasatch County, Washington County,
> Wayne County, Weber County

## 2. Volunteer spreadsheet

1. Create a second Google Sheet. Name it e.g. "Precinct Tool — Volunteers".
2. **File → Import → Upload →** `Config.csv` → **Insert new sheet(s)**.
   Rename that tab to `Config` if needed.
3. **File → Import → Upload →** `Submissions.csv` → **Insert new sheet(s)**.
   Rename that tab to `Submissions` if needed.
4. Delete the default empty "Sheet1".
5. Copy its Sheet ID → `VOLUNTEER_SHEET_ID`.

- **Config** tab: edit the `Issues` and `Capacity` columns anytime — the funnel
  updates within ~60s. The two columns are independent lists.
- **Submissions** tab: the app appends signups here. Leave the header row intact.
  `Status` fills in as `New`; `DateContacted` is yours to fill during follow-up.

Share this sheet with the service account as **Editor** (it writes signups).
