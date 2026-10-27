// Health check for EU Consolidated Financial Sanctions List (DG FISMA / FSF) CSV 1.1 endpoint.
// Checks HTTP 200 and parses the header + first row without downloading all 25 MB if cached,
// or verifies the header + generation date from a range/stream read.
import { FSF_CSV_1_1_URL, splitSemicolonLine, normalizeGenerationDate } from '../src/lib/sanctions.js';

const REQUIRED_COLS = [
  'fileGenerationDate',
  'Entity_LogicalId',
  'Entity_EU_ReferenceNumber',
  'Entity_SubjectType',
  'Entity_Regulation_Programme',
  'NameAlias_WholeName',
  'BirthDate_BirthDate',
  'Identification_Number',
  'Citizenship_CountryIso2Code',
];

const ac = new AbortController();
const res = await fetch(FSF_CSV_1_1_URL, { signal: ac.signal });
if (!res.ok) {
  console.error(`FAIL eu-sanctions-screen health: HTTP ${res.status}`);
  process.exit(1);
}
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
while (buf.split(/\r?\n/).length < 5) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
}
ac.abort();

const lines = buf.split(/\r?\n/);
const cols = splitSemicolonLine(lines[0].replace(/^\uFEFF/, '')).map((c) => c.trim());
const missing = REQUIRED_COLS.filter((c) => !cols.includes(c));
if (missing.length) {
  console.error(`FAIL eu-sanctions-screen schema drift: missing columns ${missing.join(', ')}`);
  process.exit(1);
}
const firstRow = splitSemicolonLine(lines[1] || '');
const genDate = firstRow[cols.indexOf('fileGenerationDate')];
console.log(
  `OK eu-sanctions-screen health: columns=${cols.length}, fileGenerationDate=${genDate} (${normalizeGenerationDate(genDate)})`
);
