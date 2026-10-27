# Finnish Company Events Feed — PRH / YTJ Open Data API (`itulo/prh-company-events`)

Track daily **Finnish Trade Register (Kaupparekisteri / YTJ)** company events and monitor Finnish Business IDs (`Y-tunnus`) using the official **Finnish Patent and Registration Office (PRH) Open Data v3 APIs** (`avoindata.prh.fi`). Built for Nordic B2B KYB onboarding, credit risk alerts, supplier monitoring, and CRM enrichment.

Ships as both a **Pay-Per-Event Apify Actor** (`itulo/prh-company-events`) and an open-source **stdio MCP Server** (`src/mcp-server.js`).

> **Independent Tool Notice:** Not affiliated with or endorsed by PRH (Patentti- ja rekisterihallitus) or YTJ. Uses no PRH or YTJ logos or look-alike UI.

---

## Supported Finnish Company Event Types & Watchlist Mode

- **Daily Trade Register Events (`eventTypes`):**
  - `new_company` — Newly registered Finnish companies (`Oy`, `Oyj`, `Ky`, `Ay`, cooperatives)
  - `name_change` — Company name changes (includes `previousName`)
  - `liquidation` & `bankruptcy` — Corporate insolvency, liquidation (`selvitystila`), and bankruptcy (`konkurssi`) filings
  - `restructuring`, `dissolution`, `merger_demerger`, `industry_change` (TOL 2008), `domicile_change`, `articles_change`
- **Business ID Watchlist Diffs (`watchBusinessIds`):** Track a portfolio of Finnish Business IDs (`Y-tunnus`) across runs and detect changes to company name, TOL 2008 main business line, company form, liquidation/bankruptcy status, or municipality.
- **Strict GDPR Company-Level Whitelist:** Strips `c/o` names, street addresses, PO boxes, and natural-person board/signatory entry codes. Retains only postcode, city, municipality code, and a boolean `includesRepresentationChanges` flag.

---

## Sample Output Record

```json
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
```

---

## Pay-Per-Event Pricing (`PAY_PER_EVENT`)

| Event Name | Price (USD) | Description |
|---|---|---|
| `actor-start` | **$0.01 / run** | Flat fee for starting an Actor run |
| `company-event` | **$0.002 / event** ($2.00 / 1,000) | Each normalized Finnish company event or watchlist diff written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Licence:** Creative Commons Attribution 4.0 International ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) from [avoindata.prh.fi](https://avoindata.prh.fi/fi/info/swagger-ui).
- **Mandatory Attribution on Every Record:** `Source: Finnish Patent and Registration Office (PRH), open data avoindata.prh.fi (YTJ / Trade Register), licence CC BY 4.0`

---

## Connect to Claude Desktop, Cursor & MCP Clients (Model Context Protocol)

You can use **`itulo/prh-company-events`** as a live tool inside **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible AI agent in two ways:

### Option A: Hosted Apify MCP Server (`@apify/actors-mcp-server`)
Zero local setup required. Add this to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) or Cursor `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "prh-company-events": {
      "command": "npx",
      "args": [
        "-y",
        "@apify/actors-mcp-server",
        "--actors",
        "itulo/prh-company-events"
      ],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

### Option B: Local Stdio MCP Server (Open-Source CLI)
Run the bundled stdio MCP server (`src/mcp-server.js`) directly on your machine. Exposed MCP tools: `prh_company_events`, `prh_watch_companies`, `prh_licence_info`.

```json
{
  "mcpServers": {
    "prh-company-events-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/tools/prh-company-events/src/mcp-server.js"
      ]
    }
  }
}
```

---

## n8n, Make.com & REST API Integration (One-Call Sync JSON)

Trigger **`itulo/prh-company-events`** synchronously and get the normalized JSON dataset items back in a single HTTP request — ideal for **n8n `HTTP Request` nodes**, **Make.com**, **Zapier**, or cron webhooks:

- **Method:** `POST`
- **Endpoint:** `https://api.apify.com/v2/acts/itulo~prh-company-events/run-sync-get-dataset-items?token=YOUR_APIFY_API_TOKEN`
- **Headers:** `Content-Type: application/json`

### cURL Example

```bash
curl -s -X POST \
  "https://api.apify.com/v2/acts/itulo~prh-company-events/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"eventTypes":["new_company","name_change","liquidation","bankruptcy"],"dateFrom":"2026-10-20","dateTo":"2026-10-27","maxPerEvent":10,"alertMode":false}'
```

---

## LangChain, CrewAI, Node.js & Python SDK Snippets

### Node.js (`apify-client`)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('itulo/prh-company-events').call({
  "eventTypes": [
    "new_company",
    "name_change",
    "liquidation",
    "bankruptcy"
  ],
  "dateFrom": "2026-10-20",
  "dateTo": "2026-10-27",
  "maxPerEvent": 10,
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
run = client.actor("itulo/prh-company-events").call(run_input={
  "eventTypes": [
    "new_company",
    "name_change",
    "liquidation",
    "bankruptcy"
  ],
  "dateFrom": "2026-10-20",
  "dateTo": "2026-10-27",
  "maxPerEvent": 10,
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
    actor_id="itulo/prh-company-events",
    run_input={
  "eventTypes": [
    "new_company",
    "name_change",
    "liquidation",
    "bankruptcy"
  ],
  "dateFrom": "2026-10-20",
  "dateTo": "2026-10-27",
  "maxPerEvent": 10,
  "alertMode": false
},
    dataset_mapping_function=lambda item: str(item),
)
docs = loader.load()
```

---

## Frequently Asked Questions (FAQ)

### Which official Finnish Trade Register APIs does this actor query?
It queries the official Finnish Patent and Registration Office (PRH / Patentti- ja rekisterihallitus) Open Data v3 endpoints: `opendata-ytj-api/v3` and `opendata-registerednotices-api/v3` (`avoindata.prh.fi`). No API key is required.

### How does the Business ID (Y-tunnus) watchlist mode work?
Pass an array of Finnish Business IDs in `watchBusinessIds` (e.g. `["0112038-9", "0892215-7"]`). The actor snapshots each company’s registered name, TOL 2008 industry code, company form, liquidation/bankruptcy situation, and municipality in a named KV store and emits a diff whenever a tracked supplier or customer changes status.

### How is GDPR compliance enforced on Finnish company records?
Every record passes through a strict company-level whitelist (`companyLevel()`). Street addresses, `c/o` personal names, building/apartment numbers, and person-level Trade Register entry codes (board members, managing directors, auditors, beneficial owners) are stripped; only postcode, city, municipality code, and a boolean `includesRepresentationChanges` flag are retained.

**Related Search Keywords:** PRH Open Data API · YTJ Finnish Company API · Finnish Trade Register API · Finland Business ID Watchlist (Y-tunnus) · Finnish Company Bankruptcies & Liquidations Feed · B2B KYB Finland Open Data · PRH YTJ MCP Server
