/**
 * GET /api/candidates
 *
 * Reads the candidate Google Sheet, filters by the district(s) provided, and
 * returns matching active candidates. Organizers manage the sheet directly.
 *
 * Query params (provide at least one):
 *   houseDistrict, senateDistrict, congressDistrict, schoolBoard,
 *   schoolDistrict, county, precinctId
 *
 * Expected sheet headers (row 1, order-independent):
 *   Name | Office | DistrictType | District | PhotoURL | Bio | Website |
 *   Email | Phone | Facebook | Instagram | X | VolunteerURL | DonateURL |
 *   TopIssues | Active | Order
 */

const config = require('../lib/config');
const { readRange, rowsToObjects } = require('../lib/sheets');

// Short in-memory cache so a warm function instance doesn't refetch every call
let _cache = { rows: null, exp: 0 };
const CACHE_MS = 60 * 1000;

async function getCandidateRows() {
  const now = Date.now();
  if (_cache.rows && _cache.exp > now) return _cache.rows;
  const values = await readRange(config.sheets.candidateId, `${config.sheets.candidateTab}!A:Z`);
  const rows = rowsToObjects(values);
  _cache = { rows, exp: now + CACHE_MS };
  return rows;
}

function isActive(row) {
  const v = String(row.Active ?? '').trim().toLowerCase();
  return v !== 'false' && v !== 'no' && v !== '0' && v !== 'n';
}

// Display order for results that span multiple district types: top-down from
// federal to local. Unknown types sort last (keeps future/custom types working).
const TYPE_ORDER = { congress: 0, senate: 1, house: 2, school_board: 3, school_district: 4, county: 5, precinct: 6 };
const typeRank = t => (t in TYPE_ORDER ? TYPE_ORDER[t] : 99);

// District values match exactly, EXCEPT school_district: it's keyed by a
// free-text name (title-cased from the GIS `NAME` field), not a number, so a
// stray case/whitespace difference in the sheet would silently drop a
// candidate. Normalize both sides for that one type only.
function districtMatches(type, sheetVal, wantedVal) {
  // school_district and county are keyed by free-text NAME (not a number), so
  // normalize case/whitespace on both sides to avoid silent drops. Numeric
  // types (house/senate/congress/school_board) stay exact compares.
  if (type === 'school_district' || type === 'county') {
    const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
    return norm(sheetVal) === norm(wantedVal);
  }
  return sheetVal === wantedVal;
}

function splitIssues(raw) {
  return String(raw || '')
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function shapeCandidate(row) {
  return {
    name:         row.Name || '',
    office:       row.Office || '',
    party:        row.Party || '',
    incumbent:    /^(true|yes|y|1)$/i.test(String(row.Incumbent ?? '').trim()),
    // Optional organizer column, passed through raw. Known values:
    // GENERAL[ | note]  |  PRIMARY-PENDING  |  INCUMBENT — <annotation>
    status:       String(row.Status || '').trim(),
    districtType: String(row.DistrictType || '').trim().toLowerCase(),
    district:     String(row.District || '').trim(),
    photoUrl:     row.PhotoURL || '',
    bio:          row.Bio || '',
    website:      row.Website || '',       // campaign site
    officialUrl:  row.OfficialURL || '',   // official office page (legislature/house.gov)
    email:        row.Email || '',
    phone:        row.Phone || '',
    social: {
      facebook:  row.Facebook || '',
      instagram: row.Instagram || '',
      x:         row.X || row.Twitter || '',
    },
    volunteerUrl: row.VolunteerURL || '',
    donateUrl:    row.DonateURL || '',
    issues:       splitIssues(row.TopIssues),
    order:        Number(row.Order || 0),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // CDN-cache so public lookups rarely touch the Sheets API
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { houseDistrict, senateDistrict, congressDistrict, schoolBoard, schoolDistrict, county, precinctId } = req.query;

  // Map each district type to the requested value
  const wanted = {};
  if (houseDistrict)    wanted.house           = String(houseDistrict).trim();
  if (senateDistrict)   wanted.senate          = String(senateDistrict).trim();
  if (congressDistrict) wanted.congress        = String(congressDistrict).trim();
  if (schoolBoard)      wanted.school_board    = String(schoolBoard).trim();
  if (schoolDistrict)   wanted.school_district = String(schoolDistrict).trim();
  if (county)           wanted.county          = String(county).trim();
  if (precinctId)       wanted.precinct        = String(precinctId).trim();

  if (!Object.keys(wanted).length) {
    return res.status(400).json({ error: 'Provide at least one district parameter.' });
  }

  if (!config.sheets.candidateId) {
    return res.status(500).json({ error: 'CANDIDATE_SHEET_ID is not configured.' });
  }

  try {
    const rows = await getCandidateRows();
    const candidates = rows
      .filter(isActive)
      .map(shapeCandidate)
      .filter(c => c.districtType in wanted && districtMatches(c.districtType, c.district, wanted[c.districtType]))
      .sort((a, b) =>
        typeRank(a.districtType) - typeRank(b.districtType) ||
        a.order - b.order ||
        a.name.localeCompare(b.name));

    return res.status(200).json({ success: true, candidates });
  } catch (err) {
    console.error('[candidates] error:', err.message);
    return res.status(500).json({ error: 'Failed to load candidates.' });
  }
};
