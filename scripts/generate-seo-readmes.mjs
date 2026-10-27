import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/workspace/open-data-factory';

function buildIntegrationAndSeoBlock({
  actorName,
  actorId,
  title,
  shortDesc,
  mcpServerKey,
  mcpToolsList,
  requiresFingridKey = false,
  sampleInputJson,
  seoKeywords,
  faqs,
}) {
  const inputPretty = JSON.stringify(sampleInputJson, null, 2);
  const inputOneLine = JSON.stringify(sampleInputJson);
  const localEnvBlock = requiresFingridKey
    ? `,\n      "env": {\n        "FINGRID_API_KEY": "YOUR_FREE_FINGRID_API_KEY"\n      }`
    : '';

  return `## Connect to Claude Desktop, Cursor & MCP Clients (Model Context Protocol)

You can use **\`itulo/${actorName}\`** as a live tool inside **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible AI agent in two ways:

### Option A: Hosted Apify MCP Server (\`@apify/actors-mcp-server\`)
Zero local setup required. Add this to your \`claude_desktop_config.json\` (macOS: \`~/Library/Application Support/Claude/claude_desktop_config.json\`, Windows: \`%APPDATA%\\Claude\\claude_desktop_config.json\`) or Cursor \`.cursor/mcp.json\`:

\`\`\`json
{
  "mcpServers": {
    "${mcpServerKey}": {
      "command": "npx",
      "args": [
        "-y",
        "@apify/actors-mcp-server",
        "--actors",
        "itulo/${actorName}"
      ],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
\`\`\`

### Option B: Local Stdio MCP Server (Open-Source CLI)
Run the bundled stdio MCP server (\`src/mcp-server.js\`) directly on your machine. Exposed MCP tools: ${mcpToolsList.map((t) => `\`${t}\``).join(', ')}.

\`\`\`json
{
  "mcpServers": {
    "${mcpServerKey}-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/tools/${actorName}/src/mcp-server.js"
      ]${localEnvBlock}
    }
  }
}
\`\`\`

---

## n8n, Make.com & REST API Integration (One-Call Sync JSON)

Trigger **\`itulo/${actorName}\`** synchronously and get the normalized JSON dataset items back in a single HTTP request — ideal for **n8n \`HTTP Request\` nodes**, **Make.com**, **Zapier**, or cron webhooks:

- **Method:** \`POST\`
- **Endpoint:** \`https://api.apify.com/v2/acts/itulo~${actorName}/run-sync-get-dataset-items?token=YOUR_APIFY_API_TOKEN\`
- **Headers:** \`Content-Type: application/json\`

### cURL Example

\`\`\`bash
curl -s -X POST \\
  "https://api.apify.com/v2/acts/itulo~${actorName}/run-sync-get-dataset-items?token=\${APIFY_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '${inputOneLine}'
\`\`\`

---

## LangChain, CrewAI, Node.js & Python SDK Snippets

### Node.js (\`apify-client\`)

\`\`\`javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('itulo/${actorName}').call(${inputPretty.replace(/\n/g, '\n')});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
\`\`\`

### Python (\`apify-client\` / LangChain \`ApifyWrapper\` / CrewAI)

\`\`\`python
import os
from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])
run = client.actor("itulo/${actorName}").call(run_input=${inputPretty})
items = client.dataset(run["defaultDatasetId"]).list_items().items
for row in items:
    print(row)
\`\`\`

### LangChain Python Tool

\`\`\`python
from langchain_community.utilities import ApifyWrapper

apify = ApifyWrapper()
loader = apify.call_actor(
    actor_id="itulo/${actorName}",
    run_input=${inputPretty},
    dataset_mapping_function=lambda item: str(item),
)
docs = loader.load()
\`\`\`

---

## Frequently Asked Questions (FAQ)

${faqs.map(({ q, a }) => `### ${q}\n${a}`).join('\n\n')}

**Related Search Keywords:** ${seoKeywords.join(' · ')}
`;
}

const TOOLS = [
  {
    actorName: 'ted-tender-feed',
    actorId: 'jcGqBCVowOvega1FL',
    mcpServerKey: 'eu-ted-tenders',
    mcpToolsList: ['ted_search_tenders', 'ted_new_tenders_alert', 'ted_licence_info'],
    sampleInputJson: {
      cpvCodes: ['72000000'],
      countries: ['FIN', 'SWE'],
      countryField: 'buyer',
      noticeTypes: ['competition'],
      maxResults: 10,
      language: 'eng',
      collapseByProcedure: true,
      alertMode: false,
    },
    seoKeywords: [
      'EU TED Tenders API',
      'TED Europa API v3',
      'European Public Procurement Notices API',
      'CPV Code Tender Monitor',
      'EU Government Contracts Feed',
      'B2G Sales Lead Generation Europe',
      'TED MCP Server',
    ],
    faqs: [
      {
        q: 'How does the EU TED Tenders API actor filter public procurement notices?',
        a: 'It queries the official Publications Office of the European Union TED Search API v3 (`api.ted.europa.eu/v3/notices/search`) using Expert Query syntax. You can filter by 8-digit CPV procurement codes (parent CPV codes automatically match child categories), ISO buyer or performance countries (`FIN`, `SWE`, `DEU`, etc.), publication date window, and notice type (`competition`, `planning`, `award`, `change`).',
      },
      {
        q: 'How does incremental alert mode (`alertMode: true`) prevent duplicate tenders?',
        a: 'When `alertMode: true` is enabled, the actor persists seen notice publication numbers in a named Apify Key-Value Store (`ted-tender-feed-alert-state`) under your `alertStateKey` and emits only newly published notices since the previous scheduled run.',
      },
      {
        q: 'Is personal data stripped for GDPR compliance?',
        a: 'Yes. The tool requests strictly organisation-level fields (`buyer-name`, `buyer-country`, CPV codes, estimated values, deadlines, and official TED notice links) and never requests natural-person contact names, emails, phone numbers, or jury members.',
      },
    ],
    headerBody: `# EU Tender Feed (TED) — European Public Procurement Notices API (\`itulo/ted-tender-feed\`)

Search, deduplicate, and monitor official **European Union public procurement notices** from the **TED (Tenders Electronic Daily) Search API v3** (\`api.ted.europa.eu/v3/notices/search\`; keyless official EU open data). Built for B2G sales pipelines, RFP monitoring, CPV code tracking, and AI procurement agents.

Ships as both a **Pay-Per-Event Apify Actor** (\`itulo/ted-tender-feed\`) and an open-source **stdio MCP Server** (\`src/mcp-server.js\`) powered by one shared library (\`src/lib/ted.js\`).

> **Independent Tool Notice:** Not affiliated with or endorsed by the Publications Office of the European Union. Uses no TED or EU logos and is a structured data feed from one official API.

---

## Key Features for EU Public Procurement & Tender Monitoring

- **CPV Hierarchy & Multi-Country Filtering:** Filter by 8-digit Common Procurement Vocabulary (\`cpvCodes\`, e.g. \`"72000000"\` IT services, \`"45000000"\` construction, \`"33000000"\` medical equipment), buyer country or place of performance (\`FIN\`, \`SWE\`, \`DEU\`, \`FRA\`, \`NLD\`, etc.), and notice category (\`competition\`, \`planning\`, \`award\`, \`change\`).
- **Procedure Deduplication (\`collapseByProcedure\`):** Collapses corrigenda and multi-version notices so your CRM or Slack webhook receives only the latest notice per procurement procedure.
- **Stateful Incremental Alert Mode (\`alertMode: true\`):** Stores seen notice IDs in the named Key-Value Store \`ted-tender-feed-alert-state\` so daily/hourly scheduled runs emit **only brand-new tenders**.
- **Strict GDPR Data Minimisation:** Requests organisation-level buyer and contract fields only — never natural-person contact points, emails, phones, jury members, or individual tenderer names.

---

## Input Parameters

| Field | Example | Description |
|---|---|---|
| \`cpvCodes\` | \`["72000000"]\` | 8-digit CPV codes; parent codes automatically match child codes |
| \`countries\` | \`["FIN", "SWE"]\` | ISO alpha-2 or alpha-3 country codes |
| \`countryField\` | \`"buyer"\` / \`"performance"\` | Filter by contracting authority country or place of performance |
| \`noticeTypes\` | \`["competition"]\` | Groups: \`competition\`, \`planning\`, \`award\`, \`change\`, or raw TED subtype codes |
| \`publishedFrom\` / \`publishedTo\` | \`"2026-10-01"\` | \`YYYY-MM-DD\` range (defaults to last 7 days or since last alert run) |
| \`maxResults\` | \`50\` | Maximum notices returned per run (\`1\`–\`1000\`) |
| \`collapseByProcedure\` | \`true\` | Keep only the newest notice per procurement procedure identifier |
| \`alertMode\` / \`alertStateKey\` | \`true\`, \`"nordic-it"\` | Emit only unseen notices across scheduled runs |

---

## Sample Output Record

\`\`\`json
{
  "publicationNumber": "700214-2026",
  "noticeType": "cn-standard",
  "noticeTypeLabel": "Contract notice",
  "title": "Sweden – Software package and information systems – Personal- och lönesystem",
  "buyerNames": ["Vaggeryds kommun"],
  "buyerCountries": ["SWE"],
  "cpvCodes": ["48000000", "72000000"],
  "publicationDate": "2026-10-09",
  "tenderDeadline": null,
  "estimatedValue": { "amount": 9600000, "currency": "SEK" },
  "url": "https://ted.europa.eu/en/notice/-/detail/700214-2026",
  "attribution": "Source: TED - Tenders Electronic Daily (ted.europa.eu), © European Union, 1998-2026. Reused under the European Commission reuse policy (Decision 2011/833/EU); changes: fields selected, normalised and deduplicated.",
  "licenceUrl": "https://ted.europa.eu/en/legal-notice"
}
\`\`\`

---

## Pay-Per-Event Pricing (\`PAY_PER_EVENT\`)

| Event Name | Price (USD) | Description |
|---|---|---|
| \`actor-start\` | **$0.01 / run** | Flat fee for starting an Actor run |
| \`tender-notice\` | **$0.003 / notice** ($3.00 / 1,000) | Each normalized EU public procurement notice written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Official Source & Reuse Policy:** Reused under **European Commission Decision 2011/833/EU** on the reuse of Commission documents and CC BY 4.0 ([TED Legal Notice](https://ted.europa.eu/en/legal-notice)).
- **Mandatory Attribution on Every Record:** \`Source: TED - Tenders Electronic Daily (ted.europa.eu), © European Union, 1998-2026. Reused under the European Commission reuse policy (Decision 2011/833/EU); changes: fields selected, normalised and deduplicated.\`
`,
  },
  {
    actorName: 'prh-company-events',
    actorId: 'Pp9jXWh5cPMcJtnHX',
    mcpServerKey: 'prh-company-events',
    mcpToolsList: ['prh_company_events', 'prh_watch_companies', 'prh_licence_info'],
    sampleInputJson: {
      eventTypes: ['new_company', 'name_change', 'liquidation', 'bankruptcy'],
      dateFrom: '2026-10-20',
      dateTo: '2026-10-27',
      maxPerEvent: 10,
      alertMode: false,
    },
    seoKeywords: [
      'PRH Open Data API',
      'YTJ Finnish Company API',
      'Finnish Trade Register API',
      'Finland Business ID Watchlist (Y-tunnus)',
      'Finnish Company Bankruptcies & Liquidations Feed',
      'B2B KYB Finland Open Data',
      'PRH YTJ MCP Server',
    ],
    faqs: [
      {
        q: 'Which official Finnish Trade Register APIs does this actor query?',
        a: 'It queries the official Finnish Patent and Registration Office (PRH / Patentti- ja rekisterihallitus) Open Data v3 endpoints: `opendata-ytj-api/v3` and `opendata-registerednotices-api/v3` (`avoindata.prh.fi`). No API key is required.',
      },
      {
        q: 'How does the Business ID (Y-tunnus) watchlist mode work?',
        a: 'Pass an array of Finnish Business IDs in `watchBusinessIds` (e.g. `["0112038-9", "0892215-7"]`). The actor snapshots each company’s registered name, TOL 2008 industry code, company form, liquidation/bankruptcy situation, and municipality in a named KV store and emits a diff whenever a tracked supplier or customer changes status.',
      },
      {
        q: 'How is GDPR compliance enforced on Finnish company records?',
        a: 'Every record passes through a strict company-level whitelist (`companyLevel()`). Street addresses, `c/o` personal names, building/apartment numbers, and person-level Trade Register entry codes (board members, managing directors, auditors, beneficial owners) are stripped; only postcode, city, municipality code, and a boolean `includesRepresentationChanges` flag are retained.',
      },
    ],
    headerBody: `# Finnish Company Events Feed — PRH / YTJ Open Data API (\`itulo/prh-company-events\`)

Track daily **Finnish Trade Register (Kaupparekisteri / YTJ)** company events and monitor Finnish Business IDs (\`Y-tunnus\`) using the official **Finnish Patent and Registration Office (PRH) Open Data v3 APIs** (\`avoindata.prh.fi\`). Built for Nordic B2B KYB onboarding, credit risk alerts, supplier monitoring, and CRM enrichment.

Ships as both a **Pay-Per-Event Apify Actor** (\`itulo/prh-company-events\`) and an open-source **stdio MCP Server** (\`src/mcp-server.js\`).

> **Independent Tool Notice:** Not affiliated with or endorsed by PRH (Patentti- ja rekisterihallitus) or YTJ. Uses no PRH or YTJ logos or look-alike UI.

---

## Supported Finnish Company Event Types & Watchlist Mode

- **Daily Trade Register Events (\`eventTypes\`):**
  - \`new_company\` — Newly registered Finnish companies (\`Oy\`, \`Oyj\`, \`Ky\`, \`Ay\`, cooperatives)
  - \`name_change\` — Company name changes (includes \`previousName\`)
  - \`liquidation\` & \`bankruptcy\` — Corporate insolvency, liquidation (\`selvitystila\`), and bankruptcy (\`konkurssi\`) filings
  - \`restructuring\`, \`dissolution\`, \`merger_demerger\`, \`industry_change\` (TOL 2008), \`domicile_change\`, \`articles_change\`
- **Business ID Watchlist Diffs (\`watchBusinessIds\`):** Track a portfolio of Finnish Business IDs (\`Y-tunnus\`) across runs and detect changes to company name, TOL 2008 main business line, company form, liquidation/bankruptcy status, or municipality.
- **Strict GDPR Company-Level Whitelist:** Strips \`c/o\` names, street addresses, PO boxes, and natural-person board/signatory entry codes. Retains only postcode, city, municipality code, and a boolean \`includesRepresentationChanges\` flag.

---

## Sample Output Record

\`\`\`json
{
  "eventType": "name_change",
  "eventDate": "2026-10-08",
  "recordNumber": "2026/494243",
  "businessId": "0892215-7",
  "companyName": "Pelti- ja Rautatyö Salminen Oy",
  "previousName": "Pelti- ja Rautatyö E. Salminen Oy",
  "companyForm": { "code": "16", "en": "Limited company" },
  "mainBusinessLine": {
    "tol2008": "43999",
    "en": "Other miscellaneous specialised construction activities n.e.c."
  },
  "location": { "postCode": "00580", "city": "HELSINKI", "municipalityCode": "091" },
  "entryCodes": ["STA", "TMI"],
  "includesRepresentationChanges": true,
  "attribution": "Source: Finnish Patent and Registration Office (PRH), open data avoindata.prh.fi (YTJ / Trade Register), licence CC BY 4.0",
  "licenceUrl": "https://creativecommons.org/licenses/by/4.0/"
}
\`\`\`

---

## Pay-Per-Event Pricing (\`PAY_PER_EVENT\`)

| Event Name | Price (USD) | Description |
|---|---|---|
| \`actor-start\` | **$0.01 / run** | Flat fee for starting an Actor run |
| \`company-event\` | **$0.002 / event** ($2.00 / 1,000) | Each normalized Finnish company event or watchlist diff written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Licence:** Creative Commons Attribution 4.0 International ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) from [avoindata.prh.fi](https://avoindata.prh.fi/fi/info/swagger-ui).
- **Mandatory Attribution on Every Record:** \`Source: Finnish Patent and Registration Office (PRH), open data avoindata.prh.fi (YTJ / Trade Register), licence CC BY 4.0\`
`,
  },
  {
    actorName: 'eu-sanctions-screen',
    actorId: '726vgLbzE8fO96XZr',
    mcpServerKey: 'eu-sanctions-screen',
    mcpToolsList: ['eu_sanctions_screen', 'eu_sanctions_lookup', 'eu_sanctions_list_info'],
    sampleInputJson: {
      queries: ['Saddam Hussein Al-Tikriti', 'Clean Nordic Logistics Oy'],
      subjectType: 'all',
      fuzzyThreshold: 0.78,
      maxMatchesPerQuery: 5,
      includeClearQueries: true,
    },
    seoKeywords: [
      'EU Sanctions Screening API',
      'EU Consolidated Financial Sanctions List API',
      'DG FISMA FSF Sanctions Check',
      'KYC AML Sanctions Screening Europe',
      'Fuzzy Name Matching EU Sanctions',
      'EU Sanctions MCP Server',
    ],
    faqs: [
      {
        q: 'Where does the EU Sanctions Screening API get its sanctions list data?',
        a: 'It fetches and parses the official European Commission DG FISMA Consolidated Financial Sanctions Files (FSF CSV 1.1) published on the EU Open Data Portal (`data.europa.eu` / `webgate.ec.europa.eu/fsd/fsf`), collapsing all aliases, birth dates, nationalities, identification numbers, and Official Journal legal basis links into unified entity records.',
      },
      {
        q: 'How are exact matches vs. fuzzy matches scored and labeled?',
        a: 'An exact normalized match on a primary name, alias, EU reference number (`EU.xx.xx`), UN ID, or passport/registration number returns `score = 1.0` (`matchType: "exact"`). Non-exact matches above `fuzzyThreshold` use composite Jaro-Winkler + token-order-independent scoring and are strictly labeled `"possible match"` for human compliance review against the Official Journal.',
      },
      {
        q: 'Can I screen an entire batch of counterparty names in one API call?',
        a: 'Yes. Pass hundreds of company or individual names in the `queries` array. The actor loads and indexes the consolidated EU sanctions list once in memory and screens the entire batch in milliseconds.',
      },
    ],
    headerBody: `# EU Consolidated Financial Sanctions Screening API (\`itulo/eu-sanctions-screen\`)

Screen company names, individuals, EU sanctions reference numbers (\`EU.xx.xx\`), UN IDs, and tax/registration numbers against the official **European Commission Consolidated Financial Sanctions List (DG FISMA — Financial Sanctions Files, CSV 1.1)**. Built for KYC/KYB onboarding, trade compliance, accounts-payable screening, and AI compliance agents.

Ships as both a **Pay-Per-Event Apify Actor** (\`itulo/eu-sanctions-screen\`) and an open-source **stdio MCP Server** (\`src/mcp-server.js\`).

> **Disclaimer — Not Legal Advice:** Screening results are informational aids only and do not constitute a legal determination of sanctions status. Fuzzy matches are strictly labeled **\`"possible match"\`** for human review. Only the regulations published in the **Official Journal of the European Union** are legally binding. Independent tool; not affiliated with or endorsed by the European Commission.

---

## Key Features for EU KYC / KYB & Sanctions Compliance

- **Unified Entity Index:** Collapses the ~25 MB official DG FISMA FSF CSV 1.1 into unified entity records with all transliterated aliases, functions/titles, birth dates, citizenships, addresses, passport/registration IDs, programme codes (\`RUS\`, \`BLR\`, \`IRN\`, \`SYR\`, etc.), and Official Journal regulation URLs.
- **Exact & Non-Distorting Fuzzy Screening:**
  - **Exact Match (\`score = 1.0\`):** Exact normalized match on primary name, any listed alias, \`Entity_EU_ReferenceNumber\`, \`Entity_UnitedNationId\`, or \`Identification_Number\`.
  - **Possible Match (\`score < 1.0\`):** Composite Jaro-Winkler + token-order-independent similarity. Per Commission Decision 2011/833/EU Art. 6(2), every non-exact candidate is explicitly labeled \`"possible match (fuzzy similarity — manual review against the Official Journal required; not a determination)"\`.
- **Mandatory Audit Trail Envelope:** Every output record includes \`listPublicationDate\`, \`fileGenerationDate\`, \`disclaimer\`, and \`attribution\`.

---

## Pay-Per-Event Pricing (\`PAY_PER_EVENT\`)

| Event Name | Price (USD) | Description |
|---|---|---|
| \`actor-start\` | **$0.01 / run** | Flat fee for starting an Actor run |
| \`screened-query\` | **$0.002 / query** ($2.00 / 1,000) | Each screened query or sanctions match row written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Official Source:** European Commission, DG FISMA — Financial Sanctions Files (FSF), Consolidated list of persons, groups and entities subject to EU financial sanctions (\`data.europa.eu\`).
- **Licence:** Reused under **European Commission Decision 2011/833/EU** on the reuse of Commission documents.
`,
  },
  {
    actorName: 'fingrid-grid-signals',
    actorId: 'Q7roNs8rwiJfQw0qB',
    mcpServerKey: 'fingrid-grid-signals',
    mcpToolsList: [
      'fingrid_grid_snapshot',
      'fingrid_cheap_hours',
      'fingrid_co2_intensity',
      'fingrid_series',
      'fingrid_dataset',
      'fingrid_licence_info',
    ],
    requiresFingridKey: true,
    sampleInputJson: {
      modes: ['grid_snapshot', 'cheap_hours', 'co2'],
      hoursBack: 24,
      hoursAhead: 36,
      topN: 6,
    },
    seoKeywords: [
      'Fingrid Open Data API',
      'Finnish Electricity Grid API',
      'Finland Wind & Solar Generation Forecast API',
      'Fingrid Reserve & Imbalance Power Prices',
      'Finland Grid CO2 Emission Factor API',
      'Fingrid MCP Server',
    ],
    faqs: [
      {
        q: 'Do I need a Fingrid API key to run this actor?',
        a: 'Yes. Register a free starter key in 2 minutes at `data.fingrid.fi` (Developer Portal) and pass it via the secret actor input `fingridApiKey` (or `FINGRID_API_KEY` environment variable in local MCP mode). Your key is sent only in the `x-api-key` request header to `data.fingrid.fi` and is never logged or stored.',
      },
      {
        q: 'Does this actor use Nord Pool or ENTSO-E day-ahead electricity exchange prices?',
        a: 'No. It uses 100% clean CC BY 4.0 Fingrid Open Data datasets (`166` consumption forecast, `245` wind forecast, `248` solar forecast, `396` real-time CO2 factor, `319` imbalance price, and reserve capacity datasets). The `cheap_hours` signal ranks hours by residual load (`consumption − wind − solar`) as a physical grid heuristic, not an electricity exchange spot price forecast.',
      },
      {
        q: 'How does the client respect Fingrid API rate limits?',
        a: 'The client batches dataset IDs into a single multi-dataset `/api/data` call and spaces requests by 2.1 seconds, using only ~3 requests per run (well inside Fingrid’s 10,000 requests/day limit).',
      },
    ],
    headerBody: `# Finnish Power Grid & Reserve Signals — Fingrid Open Data API (\`itulo/fingrid-grid-signals\`)

Real-time and forecast **Finnish electricity transmission system data** from the official **Fingrid Open Data API** (\`data.fingrid.fi/api\`): national power consumption & generation, wind & solar forecasts, frequency (\`177\`), FCR/aFRR/mFRR/FFR reserve capacity prices, imbalance power prices (\`319\`), real-time CO2 emission intensity (\`396\`), and derived **low-residual-load / low-carbon hour rankings**.

Ships as both a **Pay-Per-Event Apify Actor** (\`itulo/fingrid-grid-signals\`) and an open-source **stdio MCP Server** (\`src/mcp-server.js\`).

> **Independent Tool Notice:** Not affiliated with or endorsed by Fingrid Oyj. Uses no Fingrid logo or look-alike UI, and uses **zero Nord Pool or electricity exchange spot price data**.

---

## Supported Modes & Fingrid Open Data Datasets

| Mode | Fingrid Datasets Included |
|---|---|
| \`grid_snapshot\` | \`193\` consumption, \`192\` production, \`181\` wind, \`188\` nuclear, \`191\` hydro, \`194\` net import, \`177\` frequency, \`209\` system state, \`336\` shortage status, \`396\` CO2 emission factor, \`395\` non-fossil share |
| \`consumption_production\` | \`124\`, \`74\`, \`166\` consumption forecast, \`193\`, \`192\` |
| \`renewables\` | \`181\` wind real-time, \`75\` wind 15-min, \`245\` wind forecast, \`248\` solar forecast |
| \`reserves\` | \`317\` FCR-N, \`318\`/\`283\` FCR-D up/down, \`52\`/\`51\` aFRR up/down, \`329\`/\`330\` mFRR capacity up/down, \`277\` FFR |
| \`imbalance\` | \`319\` imbalance price, \`397\` calculated imbalance, \`244\`/\`106\` up/down-regulation prices |
| \`co2\` | **Derived signal:** current grid CO2 factor (\`396\`) vs. rolling p25/median/p75 percentiles (\`low\` / \`medium\` / \`high\`) |
| \`cheap_hours\` | **Derived signal:** ranks the next \`N\` hours by lowest residual load (\`166\` consumption forecast − \`245\` wind forecast − \`248\` solar forecast) |
| \`custom\` | Any Fingrid dataset ID verified to have \`organization == Fingrid\` and \`CC BY 4.0\` licence |

---

## Pay-Per-Event Pricing (\`PAY_PER_EVENT\`)

| Event Name | Price (USD) | Description |
|---|---|---|
| \`actor-start\` | **$0.01 / run** | Flat fee for starting an Actor run |
| \`derived-signal\` | **$0.005 / signal** | Each derived \`cheap_hours\` ranking or \`co2\` intensity classification (primary event) |
| \`data-records\` | **$0.10 / 100 records** ($1.00 / 1,000) | Per 100 normalized Fingrid Open Data time-series records written to the dataset |

---

## Data Licence & Attribution Compliance

- **Licence:** Creative Commons Attribution 4.0 International ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
- **Mandatory Attribution on Every Record:** \`Source Fingrid / data.fingrid.fi, license CC 4.0 BY\` plus \`modified: true\` and \`modificationNotice\` on derived records.
`,
  },
  {
    actorName: 'fmi-fingrid-nowcast',
    actorId: 'vkyLGza2qKJf7vePe',
    mcpServerKey: 'fmi-fingrid-nowcast',
    mcpToolsList: ['fmi_fingrid_nowcast', 'fmi_station_weather', 'fmi_fingrid_licence_info'],
    requiresFingridKey: true,
    sampleInputJson: {
      mode: 'joined_nowcast',
      places: ['Oulu', 'Vaasa', 'Pori', 'Helsinki', 'Lappeenranta'],
      hoursBack: 6,
      hoursAhead: 36,
      topN: 6,
      includeStationBreakdown: false,
    },
    seoKeywords: [
      'Finland Wind & Solar Nowcast API',
      'FMI Weather + Fingrid Grid Forecast',
      'EV Smart Charging API Finland',
      'Nordic Power Balancing Weather Feed',
      'Heating Degree Hours & Wind Ramp Finland',
      'FMI Fingrid MCP Server',
    ],
    faqs: [
      {
        q: 'How does this actor combine FMI meteorological forecasts with Fingrid grid forecasts?',
        a: 'It fetches hourly HARMONIE-MEPS surface weather point forecasts from the Finnish Meteorological Institute (FMI WFS 2.0) across Finland’s primary wind, solar, and demand hubs (`Oulu`, `Vaasa`, `Pori`, `Helsinki`, `Lappeenranta`) and joins them by UTC hour with Fingrid Open Data wind generation forecast (`245`), solar forecast (`248`), consumption forecast (`166`), and 15-min actual wind generation (`75`).',
      },
      {
        q: 'What derived energy & EV smart-charging signals are included?',
        a: 'Each hourly record includes capacity-weighted hub wind speed (`fmiWindSpeedWeightedMs`), max hub wind gusts & storm cut-out risk (`fmiStormCutoutRisk` at >=25 m/s), demand-weighted temperature & heating degree hours (`fmiHeatingDegreeHoursC`), 1-hour wind and residual load ramps (`windRamp1hMW`, `residualRamp1hMW`), and an EV smart-charging recommendation rank (`isEvChargeRecommended`, `nowcastScore`).',
      },
      {
        q: 'Does `weather_only` mode work without a Fingrid API key?',
        a: 'Yes! Set `mode: "weather_only"` (or call the `fmi_station_weather` MCP tool) to run 100% keyless using only FMI WFS open data. For `joined_nowcast` or `ev_charging_windows`, pass your free `fingridApiKey`.',
      },
    ],
    headerBody: `# FMI Weather + Fingrid Wind/Solar Nowcast Feed (\`itulo/fmi-fingrid-nowcast\`)

Hourly joined feature feed combining **Finnish Meteorological Institute (FMI)** WFS point weather forecasts across Finland's primary wind, solar, and demand hubs (\`Oulu\`, \`Vaasa\`, \`Pori\`, \`Helsinki\`, \`Lappeenranta\`) with **Fingrid Open Data** wind generation forecast (\`245\`), solar generation forecast (\`248\`), electricity consumption forecast (\`166\`), and actual wind generation (\`75\`).

Ships as both a **Pay-Per-Event Apify Actor** (\`itulo/fmi-fingrid-nowcast\`) and an open-source **stdio MCP Server** (\`src/mcp-server.js\`).

> **Independent Tool Notice:** Not affiliated with or endorsed by Fingrid Oyj or Ilmatieteen laitos (FMI). Uses zero Nord Pool or ENTSO-E day-ahead electricity exchange price data.

---

## Built for EV Smart-Charging, Home Automation & Nordic Energy Analytics

- **EV Smart-Charging Windows (\`isEvChargeRecommended\`):** Ranks the next 36 hours by renewable share (\`windSolarSharePct\`) and low residual load (\`residualLoadMW\`) without relying on restricted power-exchange spot prices.
- **Wind Hub & Storm Cut-Out Risk (\`fmiStormCutoutRisk\`):** Weights Ostrobothnia & West Coast wind hubs (\`Oulu\`, \`Vaasa\`, \`Pori\`) and flags turbine storm cut-out risk when hub gusts approach 25 m/s.
- **Demand-Weighted Heating Degree Hours (\`fmiHeatingDegreeHoursC\`):** Computes hourly heating demand pressure across southern and northern population centers alongside 1-hour wind & residual load ramps (\`windRamp1hMW\`, \`residualRamp1hMW\`).

---

## Pay-Per-Event Pricing (\`PAY_PER_EVENT\`)

| Event Name | Price (USD) | Description |
|---|---|---|
| \`actor-start\` | **$0.01 / run** | Flat fee for starting an Actor run |
| \`nowcast-hour\` | **$0.001 / hour** ($1.00 / 1,000) | Each joined FMI weather + Fingrid wind/solar/consumption hourly record written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Fingrid Attribution:** \`Source Fingrid / data.fingrid.fi, license CC 4.0 BY\` ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/))
- **FMI Attribution:** \`Ilmatieteen laitoksen avoin data, sääennusteet (WFS) (EN: Finnish Meteorological Institute open data, SmartMet / HARMONIE-MEPS surface weather point forecast (WFS)), CC BY 4.0\` ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.fi))
`,
  },
  {
    actorName: 'fmi-weather-warnings-alerts',
    actorId: 'z0lbkA3wM1ZIBo1QA',
    mcpServerKey: 'fmi-weather-alerts',
    mcpToolsList: [
      'fmi_active_alerts',
      'fmi_weather_observations',
      'fmi_sea_level_observations',
      'fmi_alerts_licence_info',
    ],
    sampleInputJson: {
      modes: ['active_alerts', 'weather_observations', 'sea_level_observations'],
      language: 'en-GB',
      minSeverity: 'Minor',
      maxAlerts: 20,
      places: ['Helsinki', 'Turku', 'Tampere', 'Vaasa', 'Oulu', 'Rovaniemi'],
      hoursBack: 2,
      maxSeaStations: 10,
    },
    seoKeywords: [
      'FMI Weather Warnings API',
      'Finland CAP 1.2 Severe Weather Alerts API',
      'Baltic Sea Wave & Wind Warnings API',
      'Finnish Meteorological Institute WFS Open Data',
      'Finland Mareograph Sea Level API',
      'FMI Weather MCP Server',
    ],
    faqs: [
      {
        q: 'Which official FMI feeds does this actor combine?',
        a: 'It combines three official, keyless Finnish Meteorological Institute (FMI) open-data feeds: (1) CAP 1.2 severe weather & marine alerts (`alerts.fmi.fi/cap/feed/atom_en-GB.xml`), (2) live 10-minute synoptic weather observations (`fmi::observations::weather::simple`), and (3) live Baltic Sea mareograph water-level observations (`fmi::observations::mareograph::simple`).',
      },
      {
        q: 'Can I filter FMI alerts by severity, land vs. sea area, or language?',
        a: 'Yes. Set `minSeverity` (`Minor`, `Moderate`, `Severe`, `Extreme`), `areaFilter` (region name or sea area such as `Gulf of Finland`, `Bothnian Sea`, `Uusimaa`), `gridOrMarineOnly: true` (wind, storm, wave, sea-level, icing), and `language` (`en-GB`, `fi-FI`, `sv-FI`).',
      },
      {
        q: 'Does this actor require an API key?',
        a: 'No. All three FMI CAP and WFS 2.0 endpoints are official keyless CC BY 4.0 open data.',
      },
    ],
    headerBody: `# Finland Severe Weather & Baltic Marine Alerts — FMI CAP & WFS API (\`itulo/fmi-weather-warnings-alerts\`)

Real-time **Finnish Meteorological Institute (FMI)** CAP 1.2 severe weather, storm wind, Baltic wave height, vessel icing, sea-level, and traffic warnings (\`alerts.fmi.fi\`) combined with live WFS 2.0 synoptic weather station observations and Baltic Sea mareograph sea-level readings (\`opendata.fmi.fi/wfs\`).

Keyless, clean **CC BY 4.0** open data built for Nordic logistics, maritime port operations, power grid resilience, construction scheduling, and property risk automation.

Ships as both a **Pay-Per-Event Apify Actor** (\`itulo/fmi-weather-warnings-alerts\`) and an open-source **stdio MCP Server** (\`src/mcp-server.js\`).

> **Independent Tool Notice:** Not affiliated with or endorsed by Ilmatieteen laitos (FMI); uses no FMI logo.

---

## Supported Modes

- **\`active_alerts\` (CAP 1.2 Severe Weather & Marine Warnings):** Normalized alerts with severity (\`Minor\`, \`Moderate\`, \`Severe\`, \`Extreme\`), alert color (\`yellow\`, \`orange\`, \`red\`), onset/expiry UTC timestamps, affected Finnish land municipalities and Baltic sea sub-basins, polygon bounding boxes, physical impact summaries, and \`isGridOrMarineRisk\` flags.
- **\`weather_observations\` (Synoptic Weather Stations):** Latest 2m air temperature, 10-min average wind speed, max wind gust, wind direction, relative humidity, 1h precipitation, snow depth, sea-level pressure, and visibility across Finnish cities.
- **\`sea_level_observations\` (Baltic Sea Mareographs):** Latest Baltic Sea water level (\`seaLevelMm\` relative to theoretical mean water) and water temperature across Finnish coastal mareograph stations (Helsinki, Turku, Hanko, Hamina, Rauma, Vaasa, Oulu, Kemi, etc.).

---

## Pay-Per-Event Pricing (\`PAY_PER_EVENT\`)

| Event Name | Price (USD) | Description |
|---|---|---|
| \`actor-start\` | **$0.01 / run** | Flat fee for starting an Actor run |
| \`weather-alert-or-obs\` | **$0.0015 / record** ($1.50 / 1,000) | Each normalized FMI CAP alert, synoptic weather observation, or Baltic mareograph sea-level observation written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Licence:** Creative Commons Attribution 4.0 International ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.fi)).
- **Mandatory Attribution on Every Record:** \`Ilmatieteen laitoksen avoin data, <dataset> (EN: Finnish Meteorological Institute open data, <dataset>), CC BY 4.0\`
`,
  },
  {
    actorName: 'eu-vies-vat-validator',
    actorId: 'Us9OpbdIXEyQnvN0z',
    mcpServerKey: 'eu-vies-vat',
    mcpToolsList: ['vies_validate_vat_batch', 'vies_member_state_status', 'vies_licence_info'],
    sampleInputJson: {
      mode: 'validate_batch',
      vatNumbers: ['FI01120389', 'FI10728943'],
      supplierCountryCode: 'FI',
      includeMemberStateStatus: false,
    },
    seoKeywords: [
      'VIES VAT Validation API',
      'EU VAT Number Batch Check API',
      'European Commission VIES REST API',
      'B2B Intra-EU Reverse Charge VAT Check',
      'GDPR Compliant VIES VAT Lookup',
      'EU VIES VAT MCP Server',
    ],
    faqs: [
      {
        q: 'Why does this EU VIES VAT Validator redact sole-trader (toiminimi) names and addresses?',
        a: 'Several national EU VAT databases (including Finland, Poland, and Ireland) return a natural person’s full name and home address when a VAT number belongs to a sole proprietor (`toiminimi` / `Einzelunternehmen`). To keep your ERP, Stripe/invoicing workflow, and AI agents strictly company-level and GDPR-compliant, this tool verifies corporate legal form markers (`Oy`, `Ab`, `GmbH`, `Ltd`, `B.V.`, `S.A.`, `S.r.l.`, `Sp. z o.o.`, etc.) and automatically redacts sole-trader personal names, street addresses, and `c/o` lines.',
      },
      {
        q: 'How does the cross-border EU B2B reverse-charge flag (`reverseChargeCandidate`) work?',
        a: 'When you provide `supplierCountryCode` (e.g. `"FI"`), any validated customer VAT number that is active (`valid: true`) in a different EU Member State (e.g. `"DE"`, `"SE"`, `"NL"`) is automatically flagged with `isCrossBorderEuB2B: true` and `reverseChargeCandidate: true` for VAT Art. 196 reverse-charge invoicing workflows.',
      },
      {
        q: 'Does it support official VIES consultation numbers (`requestIdentifier`) for tax audits?',
        a: 'Yes. Pass `requesterMemberStateCode` and `requesterNumber` (your own EU VAT number) to receive the official national tax authority `requestIdentifier` token on every validation record.',
      },
    ],
    headerBody: `# EU VIES VAT Number Batch Validator & Reverse-Charge Check (\`itulo/eu-vies-vat-validator\`)

Batch-validate **European Union (EU-27) and Northern Ireland (\`XI\`) VAT numbers** against the official **European Commission VIES (VAT Information Exchange System) REST API** (\`ec.europa.eu/taxation_customs/vies/rest-api\`), with cross-border B2B reverse-charge flags, national VAT gateway health status, and **automatic GDPR sole-trader personal data redaction**.

Ships as both a **Pay-Per-Event Apify Actor** (\`itulo/eu-vies-vat-validator\`) and an open-source **stdio MCP Server** (\`src/mcp-server.js\`).

> **Independent Tool Notice:** Not affiliated with or endorsed by the European Commission or national tax administrations; uses no EU or VIES logos.

---

## Key Features for B2B Invoicing, ERP Onboarding & Tax Automation

- **Batch EU & XI VAT Validation (\`validate_batch\`):** Accepts VAT numbers in any format (\`FI01120389\`, \`FI 0112038-9\`, \`DE123456789\`, \`SE556012579001\`, \`XI...\`), normalizes country prefixes (including Greece \`EL\`/\`GR\`), and validates against the live European Commission VIES REST endpoint.
- **Automatic GDPR Sole-Trader Redaction:** Detects corporate legal forms (\`Oy\`, \`Abp\`, \`AB\`, \`AS\`, \`GmbH\`, \`AG\`, \`B.V.\`, \`N.V.\`, \`S.A.\`, \`SAS\`, \`SARL\`, \`S.r.l.\`, \`S.L.\`, \`Sp. z o.o.\`, \`Ltd\`, \`PLC\`, etc.) and redacts natural-person names, home addresses, and \`c/o\` lines when a VAT number belongs to an individual sole proprietor.
- **Cross-Border B2B Reverse-Charge Helper:** Pass \`supplierCountryCode\` (e.g. \`"FI"\`) to compute \`isCrossBorderEuB2B\` and \`reverseChargeCandidate\` on every validated customer.
- **Member State Gateway Uptime Check (\`check_status\`):** Check which of the 28 national EU/XI VAT databases are currently \`Available\` vs. undergoing maintenance.

---

## Pay-Per-Event Pricing (\`PAY_PER_EVENT\`)

| Event Name | Price (USD) | Description |
|---|---|---|
| \`actor-start\` | **$0.01 / run** | Flat fee for starting an Actor run |
| \`vat-check\` | **$0.0025 / check** ($2.50 / 1,000) | Each EU/XI VAT number validated against VIES or Member State status row written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Licence:** Reused under **European Commission Decision 2011/833/EU** and the official VIES Specific Disclaimer ([ec.europa.eu/taxation_customs/vies](https://ec.europa.eu/taxation_customs/vies/)).
- **Mandatory Attribution on Every Record:** \`Source: European Commission, VIES (VAT Information Exchange System, ec.europa.eu/taxation_customs/vies), retrieved from national EU Member State VAT databases. Reused under Commission Decision 2011/833/EU. Company-level data only; sole-trader personal names/addresses redacted.\`
`,
  },
  {
    actorName: 'ecb-fx-rates-macro',
    actorId: 'wJlv2elTB7fccZmS4',
    mcpServerKey: 'ecb-fx-macro',
    mcpToolsList: [
      'ecb_fx_rates',
      'ecb_policy_rates_and_inflation',
      'ecb_convert_invoices',
      'ecb_licence_info',
    ],
    sampleInputJson: {
      modes: ['fx_rates', 'policy_rates', 'hicp_inflation', 'invoice_converter'],
      currencies: ['USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF', 'JPY', 'PLN'],
      lastNObservations: 5,
      inflationAreas: ['U2', 'FI', 'DE', 'FR'],
      invoices: [
        { invoiceId: 'INV-001', amount: 1500, fromCurrency: 'USD', toCurrency: 'EUR' },
        { invoiceId: 'INV-002', amount: 25000, fromCurrency: 'SEK', toCurrency: 'EUR' },
      ],
    },
    seoKeywords: [
      'ECB Exchange Rates API',
      'European Central Bank SDMX 2.1 JSON API',
      'Official EUR Reference FX Rates',
      'ECB Deposit Facility & Policy Interest Rates API',
      'Eurozone HICP Inflation API',
      'B2B Multi-Currency Invoice Converter EUR',
      'ECB FX MCP Server',
    ],
    faqs: [
      {
        q: 'Which official European Central Bank (ECB) datasets does this tool query?',
        a: 'It queries the official ECB SDMX 2.1 REST API (`data-api.ecb.europa.eu/service/data`) across three core dataflows: `EXR` (daily & historical official EUR reference exchange rates for 30+ currencies), `FM` (Eurosystem official policy interest rates: Deposit Facility `DFR`, Main Refinancing Operations `MRR_FR`, Marginal Lending Facility `MLFR`), and `ICP` (Harmonised Index of Consumer Prices `HICP` annual inflation rates for the Euro Area `U2` and EU Member States).',
      },
      {
        q: 'How does the B2B invoice converter handle weekends and TARGET bank holidays?',
        a: 'When converting an invoice on a weekend or TARGET closing day (or when no date is specified), `invoice_converter` automatically resolves the most recent published ECB reference rate on or before the target date and returns `effectiveRateDate`, `rateUsed`, `inverseRateUsed`, and the rounded `convertedAmount` — supporting both EUR conversions (`USD -> EUR`) and triangular cross-currency pairs (`USD -> SEK` via EUR).',
      },
      {
        q: 'Does this actor require an API key?',
        a: 'No. All ECB SDMX 2.1 endpoints are official keyless open statistics.',
      },
    ],
    headerBody: `# ECB Official EUR Exchange Rates, Policy Rates, Inflation & Invoice Converter (\`itulo/ecb-fx-rates-macro\`)

All-in-one B2B accounting, ERP reconciliation, and macro-treasury feed powered by the official **European Central Bank (ECB) SDMX 2.1 Data Portal** (\`data-api.ecb.europa.eu\`):
1. **\`fx_rates\` (\`EXR\`)**: Daily & historical official EUR reference exchange rates for 30+ global currencies (\`USD\`, \`GBP\`, \`SEK\`, \`NOK\`, \`DKK\`, \`CHF\`, \`JPY\`, \`PLN\`, \`CAD\`, \`AUD\`, \`CNY\`, etc.) with both \`ratePerEur\` and \`eurPerUnit\`.
2. **\`policy_rates\` (\`FM\`)**: Eurosystem key interest rates — Deposit facility (\`DFR\`), Main refinancing operations (\`MRR_FR\`), and Marginal lending facility (\`MLFR\`).
3. **\`hicp_inflation\` (\`ICP\`)**: Euro Area (\`U2\`) and EU Member State (\`FI\`, \`DE\`, \`FR\`, \`NL\`, \`SE\`, etc.) HICP annual headline inflation rates.
4. **\`invoice_converter\`**: Batch B2B invoice & cross-currency reconciliation (\`USD -> EUR\`, \`SEK -> EUR\`, \`USD -> SEK\`, etc.) with automatic prior-business-day fallback on weekends and TARGET bank holidays.

Ships as both a **Pay-Per-Event Apify Actor** (\`itulo/ecb-fx-rates-macro\`) and an open-source **stdio MCP Server** (\`src/mcp-server.js\`).

> **Independent Tool Notice:** Not affiliated with or endorsed by the European Central Bank; uses no ECB logo. ECB reference rates are published for information purposes only.

---

## Pay-Per-Event Pricing (\`PAY_PER_EVENT\`)

| Event Name | Price (USD) | Description |
|---|---|---|
| \`actor-start\` | **$0.01 / run** | Flat fee for starting an Actor run |
| \`macro-or-fx-record\` | **$0.001 / record** ($1.00 / 1,000) | Each official ECB FX rate, policy interest rate, HICP inflation reading, or converted invoice row written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Licence:** Reused under the official [Policy regarding the reuse of ESCB statistics](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html).
- **Mandatory Attribution on Every Record:** \`Source: ECB statistics (European Central Bank SDMX 2.1 Data Portal, data.ecb.europa.eu). Reused under the Policy regarding the reuse of ESCB statistics; reference rates are published for information purposes only.\`
`,
  },
  {
    actorName: 'digitraffic-port-calls-marine',
    actorId: 'dxdnGaaKiTq4Mhql6',
    mcpServerKey: 'digitraffic-marine',
    mcpToolsList: [
      'digitraffic_port_calls',
      'digitraffic_port_congestion_summary',
      'digitraffic_licence_info',
    ],
    sampleInputJson: {
      modes: ['port_calls', 'port_congestion_summary'],
      ports: ['FIHEL', 'FITKU', 'FIHKO', 'FIKTK'],
      cargoOnly: false,
      maxResults: 30,
    },
    seoKeywords: [
      'Digitraffic Port Calls API',
      'Baltic Sea Vessel Schedule & ETA API',
      'Finland Maritime Port Congestion API',
      'Fintraffic Marine Open Data API',
      'Port of Helsinki Kotka Hamina Turku Vessel Arrivals',
      'Digitraffic Marine MCP Server',
    ],
    faqs: [
      {
        q: 'Which maritime ports and vessel identifiers are supported?',
        a: 'It queries the official Fintraffic Digitraffic Marine Port Call REST API (`meri.digitraffic.fi/api/port-call/v1/port-calls`) covering all Finnish and Baltic UN/LOCODE ports (`FIHEL` Helsinki, `FIKTK` Kotka, `FIHMN` Hamina, `FITKU` Turku, `FIHKO` Hanko, `FIRAU` Rauma, `FIOUL` Oulu, etc.). You can filter by `ports`, `vesselName`, `imoNumber`, `cargoOnly`, and `etaFrom`/`etaTo`.',
      },
      {
        q: 'What does `port_congestion_summary` calculate?',
        a: 'It aggregates active and scheduled vessel calls per UN/LOCODE port, returning `totalPortCalls`, `cargoPortCalls`, `cargoSharePct`, `avgPlannedTurnaroundHours`, `activeBerthsCount`, `flagStatesCount`, and the earliest/latest ETA window for supply-chain bottleneck monitoring.',
      },
      {
        q: 'How are ship master personal names handled for GDPR compliance?',
        a: 'Raw Digitraffic port call payloads can include natural-person ship master names (`shipMasterArrival`, `shipMasterDeparture`). This tool explicitly drops all master/crew personal fields and filters `shippingAgents` to corporate entities only (`Oy`, `Ab`, `Ltd`, `Shipping`, `Logistics`, `Agency`, etc.).',
      },
    ],
    headerBody: `# Baltic & Finland Vessel Port Calls & Port Congestion — Digitraffic Marine API (\`itulo/digitraffic-port-calls-marine\`)

Real-time and scheduled **Baltic Sea & Finnish maritime vessel port calls**, berth ETA/ETD schedules, planned turnaround durations, corporate shipping agents, and per-port congestion metrics powered by **Fintraffic Digitraffic Marine Open Data** (\`meri.digitraffic.fi/api/port-call/v1/port-calls\`; keyless CC BY 4.0).

Ships as both a **Pay-Per-Event Apify Actor** (\`itulo/digitraffic-port-calls-marine\`) and an open-source **stdio MCP Server** (\`src/mcp-server.js\`).

> **Independent Tool Notice:** Not affiliated with or endorsed by Fintraffic; uses no Fintraffic or Digitraffic logos.

---

## Supported Modes for Maritime & Supply-Chain Automation

- **\`port_calls\` (Normalized Vessel Arrivals & Departures):** Filter by UN/LOCODE port (\`FIHEL\` Helsinki, \`FITKU\` Turku, \`FIHKO\` Hanko, \`FIKTK\` Kotka, \`FIHMN\` Hamina, \`FIRAU\` Rauma, \`FIOUL\` Oulu), vessel name, IMO number, ETA window, and \`cargoOnly\`. Outputs \`portToVisit\`, \`prevPort\`, \`nextPort\`, \`portAreaName\`, \`berthName\`, \`vesselName\`, \`imoLloyds\`, \`radioCallSign\`, \`nationality\`, \`vesselTypeCode\`, \`arrivalWithCargo\`, \`etaUtc\`, \`etdUtc\`, \`plannedTurnaroundHours\`, and corporate \`shippingAgents\`.
- **\`port_congestion_summary\` (Port-Level Turnaround & Berth Load):** Computes \`totalPortCalls\`, \`cargoPortCalls\`, \`cargoSharePct\`, \`avgPlannedTurnaroundHours\`, \`activeBerthsCount\`, and \`flagStatesCount\` per port.
- **GDPR By Design:** Strips \`shipMasterArrival\`, \`shipMasterDeparture\`, and free-text security notes, and restricts \`shippingAgents\` to corporate legal entities.

---

## Pay-Per-Event Pricing (\`PAY_PER_EVENT\`)

| Event Name | Price (USD) | Description |
|---|---|---|
| \`actor-start\` | **$0.01 / run** | Flat fee for starting an Actor run |
| \`port-call-record\` | **$0.0015 / record** ($1.50 / 1,000) | Each normalized vessel port call schedule or port congestion summary row written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Licence:** Creative Commons Attribution 4.0 International ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
- **Mandatory Attribution on Every Record:** \`Source: Fintraffic / digitraffic.fi, license CC 4.0 BY\`
`,
  },
  {
    actorName: 'enisa-euvd-vulnerabilities',
    actorId: 'nTcM1dvNigvGe5Zls',
    mcpServerKey: 'enisa-euvd',
    mcpToolsList: [
      'euvd_exploited_and_critical',
      'euvd_search_vulnerabilities',
      'euvd_lookup_by_id',
      'euvd_licence_info',
    ],
    sampleInputJson: {
      modes: ['exploited', 'critical'],
      maxResults: 25,
    },
    seoKeywords: [
      'ENISA EUVD API',
      'European Vulnerability Database API',
      'NIS2 Vulnerability Management Feed',
      'EU Known Exploited Vulnerabilities (KEV) API',
      'CVE & EUVD EPSS CVSS Threat Intelligence',
      'ENISA EUVD MCP Server',
    ],
    faqs: [
      {
        q: 'What is the ENISA European Vulnerability Database (EUVD)?',
        a: 'Established under the EU NIS2 Directive (Directive (EU) 2022/2555), the ENISA European Vulnerability Database (`euvd.enisa.europa.eu`) is the official European Union vulnerability registry curating actively exploited vulnerabilities (`KEV`), critical CVSS advisories, EPSS exploitation probability scores, and affected vendor/product mappings alongside CVE identifiers.',
      },
      {
        q: 'What query modes does the `enisa-euvd-vulnerabilities` actor support?',
        a: 'It supports five modes: `exploited` (latest actively exploited KEV vulnerabilities), `critical` (latest critical CVSS vulnerabilities), `latest` (newest EUVD entries), `search` (filter by `text`, `vendor`, `product`, `fromScore` CVSS 0–10, `fromEpss` 0–100, and `exploited` flag), and `lookup_by_id` (direct lookup by `CVE-YYYY-NNNN` or `EUVD-YYYY-NNNN`).',
      },
      {
        q: 'Does this actor require an API key?',
        a: 'No. The official ENISA EUVD REST API (`euvdservices.enisa.europa.eu/api`) is keyless public threat intelligence reusable with ENISA source acknowledgement.',
      },
    ],
    headerBody: `# EU ENISA Vulnerability Database (EUVD) — KEV, CVSS & NIS2 API (\`itulo/enisa-euvd-vulnerabilities\`)

Query the official **European Union Agency for Cybersecurity (ENISA) European Vulnerability Database (EUVD)** (\`euvd.enisa.europa.eu\`) for **actively exploited vulnerabilities (KEV)**, critical CVEs/EUVDs, **EPSS exploitation probability scores**, vendor/product exposure, and **NIS2 Directive** compliance threat intelligence.

Ships as both a **Pay-Per-Event Apify Actor** (\`itulo/enisa-euvd-vulnerabilities\`) and an open-source **stdio MCP Server** (\`src/mcp-server.js\`).

> **Independent Tool Notice:** Not affiliated with or endorsed by ENISA (European Union Agency for Cybersecurity); uses no ENISA or EU logos.

---

## Supported SecOps & NIS2 Threat Intelligence Modes

- **\`exploited\` (Known Exploited Vulnerabilities / KEV):** Real-time feed of vulnerabilities actively exploited in the wild, curated by ENISA and the EU CSIRT Network (\`isExploited: true\`).
- **\`critical\` (Critical CVSS Advisories):** High-severity vulnerabilities with normalized CVSS v3/v4 base scores, vector strings, and EPSS percentiles.
- **\`latest\` (Newest EUVD Publications):** Latest advisories published in the European Vulnerability Database.
- **\`search\` (Vendor / Product / CVSS / EPSS Filter):** Filter by keyword (\`text\`), \`vendor\` (e.g. \`"Microsoft"\`, \`"Fortinet"\`, \`"Cisco"\`, \`"Linux"\`), \`product\`, minimum CVSS score (\`fromScore\`), minimum EPSS score (\`fromEpss\`), and \`exploited\` status.
- **\`lookup_by_id\` (Direct CVE / EUVD Lookup):** Resolve any \`CVE-YYYY-NNNN\` or \`EUVD-YYYY-NNNN\` ID with full aliases, affected products/versions, remediation links, and references.

---

## Pay-Per-Event Pricing (\`PAY_PER_EVENT\`)

| Event Name | Price (USD) | Description |
|---|---|---|
| \`actor-start\` | **$0.01 / run** | Flat fee for starting an Actor run |
| \`vulnerability-record\` | **$0.002 / record** ($2.00 / 1,000) | Each normalized ENISA EUVD vulnerability record written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Licence:** Authorized under the [ENISA Legal Notice](https://www.enisa.europa.eu/about-enisa/legal-notice/legal-notice) (Section 1.2: reproduction and reuse authorized provided the source is acknowledged).
- **Mandatory Attribution on Every Record:** \`Source: European Union Agency for Cybersecurity (ENISA) — European Vulnerability Database (EUVD, euvd.enisa.europa.eu), © European Union Agency for Cybersecurity. Reused with source acknowledgement under the ENISA Legal Notice.\`
`,
  },
];

for (const tool of TOOLS) {
  const fullReadme = `${tool.headerBody.trim()}\n\n---\n\n${buildIntegrationAndSeoBlock(tool).trim()}\n`;
  const targetPath = path.join(ROOT, 'tools', tool.actorName, 'README.md');
  fs.writeFileSync(targetPath, fullReadme, 'utf8');
  console.log(`Updated ${targetPath} (${fullReadme.length} bytes)`);
}
