# EU Consolidated Financial Sanctions Screening API (`itulo/eu-sanctions-screen`)

Screen company names, individuals, EU sanctions reference numbers (`EU.xx.xx`), UN IDs, and tax/registration numbers against the official **European Commission Consolidated Financial Sanctions List (DG FISMA — Financial Sanctions Files, CSV 1.1)**. Built for KYC/KYB onboarding, trade compliance, accounts-payable screening, and AI compliance agents.

Ships as both a **Pay-Per-Event Apify Actor** (`itulo/eu-sanctions-screen`) and an open-source **stdio MCP Server** (`src/mcp-server.js`).

> **Disclaimer — Not Legal Advice:** Screening results are informational aids only and do not constitute a legal determination of sanctions status. Fuzzy matches are strictly labeled **`"possible match"`** for human review. Only the regulations published in the **Official Journal of the European Union** are legally binding. Independent tool; not affiliated with or endorsed by the European Commission.

---

## Key Features for EU KYC / KYB & Sanctions Compliance

- **Unified Entity Index:** Collapses the ~25 MB official DG FISMA FSF CSV 1.1 into unified entity records with all transliterated aliases, functions/titles, birth dates, citizenships, addresses, passport/registration IDs, programme codes (`RUS`, `BLR`, `IRN`, `SYR`, etc.), and Official Journal regulation URLs.
- **Exact & Non-Distorting Fuzzy Screening:**
  - **Exact Match (`score = 1.0`):** Exact normalized match on primary name, any listed alias, `Entity_EU_ReferenceNumber`, `Entity_UnitedNationId`, or `Identification_Number`.
  - **Possible Match (`score < 1.0`):** Composite Jaro-Winkler + token-order-independent similarity. Per Commission Decision 2011/833/EU Art. 6(2), every non-exact candidate is explicitly labeled `"possible match (fuzzy similarity — manual review against the Official Journal required; not a determination)"`.
- **Mandatory Audit Trail Envelope:** Every output record includes `listPublicationDate`, `fileGenerationDate`, `disclaimer`, and `attribution`.

---

## Pay-Per-Event Pricing (`PAY_PER_EVENT`)

| Event Name | Price (USD) | Description |
|---|---|---|
| `actor-start` | **$0.01 / run** | Flat fee for starting an Actor run |
| `screened-query` | **$0.002 / query** ($2.00 / 1,000) | Each screened query or sanctions match row written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Official Source:** European Commission, DG FISMA — Financial Sanctions Files (FSF), Consolidated list of persons, groups and entities subject to EU financial sanctions (`data.europa.eu`).
- **Licence:** Reused under **European Commission Decision 2011/833/EU** on the reuse of Commission documents.

---

## Connect to Claude Desktop, Cursor & MCP Clients (Model Context Protocol)

You can use **`itulo/eu-sanctions-screen`** as a live tool inside **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible AI agent in two ways:

### Option A: Hosted Apify MCP Server (`@apify/actors-mcp-server`)
Zero local setup required. Add this to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) or Cursor `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "eu-sanctions-screen": {
      "command": "npx",
      "args": [
        "-y",
        "@apify/actors-mcp-server",
        "--actors",
        "itulo/eu-sanctions-screen"
      ],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

### Option B: Local Stdio MCP Server (Open-Source CLI)
Run the bundled stdio MCP server (`src/mcp-server.js`) directly on your machine. Exposed MCP tools: `eu_sanctions_screen`, `eu_sanctions_lookup`, `eu_sanctions_list_info`.

```json
{
  "mcpServers": {
    "eu-sanctions-screen-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/tools/eu-sanctions-screen/src/mcp-server.js"
      ]
    }
  }
}
```

---

## n8n, Make.com & REST API Integration (One-Call Sync JSON)

Trigger **`itulo/eu-sanctions-screen`** synchronously and get the normalized JSON dataset items back in a single HTTP request — ideal for **n8n `HTTP Request` nodes**, **Make.com**, **Zapier**, or cron webhooks:

- **Method:** `POST`
- **Endpoint:** `https://api.apify.com/v2/acts/itulo~eu-sanctions-screen/run-sync-get-dataset-items?token=YOUR_APIFY_API_TOKEN`
- **Headers:** `Content-Type: application/json`

### cURL Example

```bash
curl -s -X POST \
  "https://api.apify.com/v2/acts/itulo~eu-sanctions-screen/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"queries":["Saddam Hussein Al-Tikriti","Clean Nordic Logistics Oy"],"subjectType":"all","fuzzyThreshold":0.78,"maxMatchesPerQuery":5,"includeClearQueries":true}'
```

---

## LangChain, CrewAI, Node.js & Python SDK Snippets

### Node.js (`apify-client`)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('itulo/eu-sanctions-screen').call({
  "queries": [
    "Saddam Hussein Al-Tikriti",
    "Clean Nordic Logistics Oy"
  ],
  "subjectType": "all",
  "fuzzyThreshold": 0.78,
  "maxMatchesPerQuery": 5,
  "includeClearQueries": true
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

### Python (`apify-client` / LangChain `ApifyWrapper` / CrewAI)

```python
import os
from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])
run = client.actor("itulo/eu-sanctions-screen").call(run_input={
  "queries": [
    "Saddam Hussein Al-Tikriti",
    "Clean Nordic Logistics Oy"
  ],
  "subjectType": "all",
  "fuzzyThreshold": 0.78,
  "maxMatchesPerQuery": 5,
  "includeClearQueries": true
})
items = client.dataset(run["defaultDatasetId"]).list_items().items
for row in items:
    print(row)
```

### LangChain Python Tool

```python
from langchain_community.utilities import ApifyWrapper

apify = ApifyWrapper()
loader = apify.call_actor(
    actor_id="itulo/eu-sanctions-screen",
    run_input={
  "queries": [
    "Saddam Hussein Al-Tikriti",
    "Clean Nordic Logistics Oy"
  ],
  "subjectType": "all",
  "fuzzyThreshold": 0.78,
  "maxMatchesPerQuery": 5,
  "includeClearQueries": true
},
    dataset_mapping_function=lambda item: str(item),
)
docs = loader.load()
```

---

## Frequently Asked Questions (FAQ)

### Where does the EU Sanctions Screening API get its sanctions list data?
It fetches and parses the official European Commission DG FISMA Consolidated Financial Sanctions Files (FSF CSV 1.1) published on the EU Open Data Portal (`data.europa.eu` / `webgate.ec.europa.eu/fsd/fsf`), collapsing all aliases, birth dates, nationalities, identification numbers, and Official Journal legal basis links into unified entity records.

### How are exact matches vs. fuzzy matches scored and labeled?
An exact normalized match on a primary name, alias, EU reference number (`EU.xx.xx`), UN ID, or passport/registration number returns `score = 1.0` (`matchType: "exact"`). Non-exact matches above `fuzzyThreshold` use composite Jaro-Winkler + token-order-independent scoring and are strictly labeled `"possible match"` for human compliance review against the Official Journal.

### Can I screen an entire batch of counterparty names in one API call?
Yes. Pass hundreds of company or individual names in the `queries` array. The actor loads and indexes the consolidated EU sanctions list once in memory and screens the entire batch in milliseconds.

**Related Search Keywords:** EU Sanctions Screening API · EU Consolidated Financial Sanctions List API · DG FISMA FSF Sanctions Check · KYC AML Sanctions Screening Europe · Fuzzy Name Matching EU Sanctions · EU Sanctions MCP Server
