/**
 * fix_submissions_columns.js — one-off admin fix for the live Submissions tab.
 *
 * The updated api/volunteer.js writes rows with two new columns (SchoolBoard,
 * SchoolDistrict) positioned immediately after Congress. appendRow writes by
 * POSITION, so the live sheet must gain those two columns in the same spot
 * BEFORE that code deploys. This script:
 *   1. reads the current header row,
 *   2. inserts two columns right after "Congress" (skips if already present),
 *   3. writes the two new header cells,
 *   4. reads back and prints the final header for verification.
 *
 * Usage:  ENV_FILE=<pulled-env> node scripts/fix_submissions_columns.js
 */
const fs = require('fs');
const path = require('path');

const envPath = process.env.ENV_FILE || path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const s = line.trim();
  if (!s || s.startsWith('#')) continue;
  const eq = s.indexOf('=');
  if (eq < 0) continue;
  const key = s.slice(0, eq).trim();
  let val = s.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  if (!(key in process.env)) process.env[key] = val;
}

const config = require('../lib/config');
const { getAccessToken } = require('../lib/sheets');
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

async function api(token, url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${url} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const id = config.sheets.volunteerId;
  const tab = config.sheets.submissionsTab;
  if (!id) throw new Error('VOLUNTEER_SHEET_ID not set');
  const token = await getAccessToken();

  // current header
  const head = await api(token, `${SHEETS_API}/${id}/values/${encodeURIComponent(tab + '!1:1')}`);
  const header = (head.values && head.values[0]) || [];
  console.log('current header:', header.join(' | '));

  if (header.includes('SchoolBoard') || header.includes('SchoolDistrict')) {
    console.log('columns already present — nothing to do');
    return;
  }
  const congressIdx = header.indexOf('Congress');
  if (congressIdx < 0) throw new Error('No "Congress" column found — header layout unexpected, aborting');

  // find the tab's numeric sheetId (gid)
  const meta = await api(token, `${SHEETS_API}/${id}?fields=sheets(properties(sheetId,title))`);
  const sheet = meta.sheets.find(s => s.properties.title === tab);
  if (!sheet) throw new Error(`Tab "${tab}" not found`);
  const gid = sheet.properties.sheetId;

  // insert 2 columns right after Congress
  await api(token, `${SHEETS_API}/${id}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        insertDimension: {
          range: { sheetId: gid, dimension: 'COLUMNS', startIndex: congressIdx + 1, endIndex: congressIdx + 3 },
          inheritFromBefore: false,
        },
      }],
    }),
  });
  console.log(`inserted 2 columns after "Congress" (index ${congressIdx})`);

  // write the new header cells (columns are 0-based; A1 letters for idx+1, idx+2)
  const colLetter = i => { let s = ''; i++; while (i) { s = String.fromCharCode(65 + ((i - 1) % 26)) + s; i = Math.floor((i - 1) / 26); } return s; };
  const range = `${tab}!${colLetter(congressIdx + 1)}1:${colLetter(congressIdx + 2)}1`;
  await api(token, `${SHEETS_API}/${id}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ range, majorDimension: 'ROWS', values: [['SchoolBoard', 'SchoolDistrict']] }),
  });

  // verify
  const after = await api(token, `${SHEETS_API}/${id}/values/${encodeURIComponent(tab + '!1:1')}`);
  console.log('new header:   ', (after.values[0] || []).join(' | '));
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
