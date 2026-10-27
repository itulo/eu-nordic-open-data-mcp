# EU Tender Feed (TED) — European Public Procurement Notices API (`itulo/ted-tender-feed`)

Search, deduplicate, and monitor official **European Union public procurement notices** from the **TED (Tenders Electronic Daily) Search API v3** (`api.ted.europa.eu/v3/notices/search`; keyless official EU open data). Built for B2G sales pipelines, RFP monitoring, CPV code tracking, and AI procurement agents.

Ships as both a **Pay-Per-Event Apify Actor** (`itulo/ted-tender-feed`) and an open-source **stdio MCP Server** (`src/mcp-server.js`) powered by one shared library (`src/lib/ted.js`).

> **Independent Tool Notice:** Not affiliated with or endorsed by the Publications Office of the European Union. Uses no TED or EU logos and is a structured data feed from one official API.

---

## Key Features for EU Public Procurement & Tender Monitoring

- **CPV Hierarchy & Multi-Country Filtering:** Filter by 8-digit Common Procurement Vocabulary (`cpvCodes`, e.g. `"72000000"` IT services, `"45000000"` construction, `"33000000"` medical equipment), buyer country or place of performance (`FIN`, `SWE`, `DEU`, `FRA`, `NLD`, etc.), and notice category (`competition`, `planning`, `award`, `change`).
- **Procedure Deduplication (`collapseByProcedure`):** Collapses corrigenda and multi-version notices so your CRM or Slack webhook receives only the latest notice per procurement procedure.
- **Stateful Incremental Alert Mode (`alertMode: true`):** Stores seen notice IDs in the named Key-Value Store `ted-tender-feed-alert-state` so daily/hourly scheduled runs emit **only brand-new tenders**.
- **Strict GDPR Data Minimisation:** Requests organisation-level buyer and contract fields only — never natural-person contact points, emails, phones, jury members, or individual tenderer names.

---

## Input Parameters

| Field | Example | Description |
|---|---|---|
| `cpvCodes` | `["72000000"]` | 8-digit CPV codes; parent codes automatically match child codes |
| `countries` | `["FIN", "SWE"]` | ISO alpha-2 or alpha-3 country codes |
| `countryField` | `"buyer"` / `"performance"` | Filter by contracting authority country or place of performance |
| `noticeTypes` | `["competition"]` | Groups: `competition`, `planning`, `award`, `change`, or raw TED subtype codes |
| `publishedFrom` / `publishedTo` | `"2026-10-01"` | `YYYY-MM-DD` range (defaults to last 7 days or since last alert run) |
| `maxResults` | `50` | Maximum notices returned per run (`1`–`1000`) |
| `collapseByProcedure` | `true` | Keep only the newest notice per procurement procedure identifier |
| `alertMode` / `alertStateKey` | `true`, `"nordic-it"` | Emit only unseen notices across scheduled runs |

---

## Sample Output Record

```json
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
```

---

## Pay-Per-Event Pricing (`PAY_PER_EVENT`)

| Event Name | Price (USD) | Description |
|---|---|---|
| `actor-start` | **$0.01 / run** | Flat fee for starting an Actor run |
| `tender-notice` | **$0.003 / notice** ($3.00 / 1,000) | Each normalized EU public procurement notice written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Official Source & Reuse Policy:** Reused under **European Commission Decision 2011/833/EU** on the reuse of Commission documents and CC BY 4.0 ([TED Legal Notice](https://ted.europa.eu/en/legal-notice)).
- **Mandatory Attribution on Every Record:** `Source: TED - Tenders Electronic Daily (ted.europa.eu), © European Union, 1998-2026. Reused under the European Commission reuse policy (Decision 2011/833/EU); changes: fields selected, normalised and deduplicated.`

---

## Connect to Claude Desktop, Cursor & MCP Clients (Model Context Protocol)

You can use **`itulo/ted-tender-feed`** as a live tool inside **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible AI agent in two ways:

### Option A: Hosted Apify MCP Server (`@apify/actors-mcp-server`)
Zero local setup required. Add this to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) or Cursor `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "eu-ted-tenders": {
      "command": "npx",
      "args": [
        "-y",
        "@apify/actors-mcp-server",
        "--actors",
        "itulo/ted-tender-feed"
      ],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

### Option B: Local Stdio MCP Server (Open-Source CLI)
Run the bundled stdio MCP server (`src/mcp-server.js`) directly on your machine. Exposed MCP tools: `ted_search_tenders`, `ted_new_tenders_alert`, `ted_licence_info`.

```json
{
  "mcpServers": {
    "eu-ted-tenders-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/tools/ted-tender-feed/src/mcp-server.js"
      ]
    }
  }
}
```

---

## n8n, Make.com & REST API Integration (One-Call Sync JSON)

Trigger **`itulo/ted-tender-feed`** synchronously and get the normalized JSON dataset items back in a single HTTP request — ideal for **n8n `HTTP Request` nodes**, **Make.com**, **Zapier**, or cron webhooks:

- **Method:** `POST`
- **Endpoint:** `https://api.apify.com/v2/acts/itulo~ted-tender-feed/run-sync-get-dataset-items?token=YOUR_APIFY_API_TOKEN`
- **Headers:** `Content-Type: application/json`

### cURL Example

```bash
curl -s -X POST \
  "https://api.apify.com/v2/acts/itulo~ted-tender-feed/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"cpvCodes":["72000000"],"countries":["FIN","SWE"],"countryField":"buyer","noticeTypes":["competition"],"maxResults":10,"language":"eng","collapseByProcedure":true,"alertMode":false}'
```

---

## LangChain, CrewAI, Node.js & Python SDK Snippets

### Node.js (`apify-client`)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('itulo/ted-tender-feed').call({
  "cpvCodes": [
    "72000000"
  ],
  "countries": [
    "FIN",
    "SWE"
  ],
  "countryField": "buyer",
  "noticeTypes": [
    "competition"
  ],
  "maxResults": 10,
  "language": "eng",
  "collapseByProcedure": true,
  "alertMode": false
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

### Python (`apify-client` / LangChain `ApifyWrapper` / CrewAI)

```python
import os
from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])
run = client.actor("itulo/ted-tender-feed").call(run_input={
  "cpvCodes": [
    "72000000"
  ],
  "countries": [
    "FIN",
    "SWE"
  ],
  "countryField": "buyer",
  "noticeTypes": [
    "competition"
  ],
  "maxResults": 10,
  "language": "eng",
  "collapseByProcedure": true,
  "alertMode": false
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
    actor_id="itulo/ted-tender-feed",
    run_input={
  "cpvCodes": [
    "72000000"
  ],
  "countries": [
    "FIN",
    "SWE"
  ],
  "countryField": "buyer",
  "noticeTypes": [
    "competition"
  ],
  "maxResults": 10,
  "language": "eng",
  "collapseByProcedure": true,
  "alertMode": false
},
    dataset_mapping_function=lambda item: str(item),
)
docs = loader.load()
```

---

## Frequently Asked Questions (FAQ)

### How does the EU TED Tenders API actor filter public procurement notices?
It queries the official Publications Office of the European Union TED Search API v3 (`api.ted.europa.eu/v3/notices/search`) using Expert Query syntax. You can filter by 8-digit CPV procurement codes (parent CPV codes automatically match child categories), ISO buyer or performance countries (`FIN`, `SWE`, `DEU`, etc.), publication date window, and notice type (`competition`, `planning`, `award`, `change`).

### How does incremental alert mode (`alertMode: true`) prevent duplicate tenders?
When `alertMode: true` is enabled, the actor persists seen notice publication numbers in a named Apify Key-Value Store (`ted-tender-feed-alert-state`) under your `alertStateKey` and emits only newly published notices since the previous scheduled run.

### Is personal data stripped for GDPR compliance?
Yes. The tool requests strictly organisation-level fields (`buyer-name`, `buyer-country`, CPV codes, estimated values, deadlines, and official TED notice links) and never requests natural-person contact names, emails, phone numbers, or jury members.

**Related Search Keywords:** EU TED Tenders API · TED Europa API v3 · European Public Procurement Notices API · CPV Code Tender Monitor · EU Government Contracts Feed · B2G Sales Lead Generation Europe · TED MCP Server
