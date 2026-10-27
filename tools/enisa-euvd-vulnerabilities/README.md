# EU ENISA Vulnerability Database (EUVD) — KEV, CVSS & NIS2 API (`itulo/enisa-euvd-vulnerabilities`)

Query the official **European Union Agency for Cybersecurity (ENISA) European Vulnerability Database (EUVD)** (`euvd.enisa.europa.eu`) for **actively exploited vulnerabilities (KEV)**, critical CVEs/EUVDs, **EPSS exploitation probability scores**, vendor/product exposure, and **NIS2 Directive** compliance threat intelligence.

Ships as both a **Pay-Per-Event Apify Actor** (`itulo/enisa-euvd-vulnerabilities`) and an open-source **stdio MCP Server** (`src/mcp-server.js`).

> **Independent Tool Notice:** Not affiliated with or endorsed by ENISA (European Union Agency for Cybersecurity); uses no ENISA or EU logos.

---

## Supported SecOps & NIS2 Threat Intelligence Modes

- **`exploited` (Known Exploited Vulnerabilities / KEV):** Real-time feed of vulnerabilities actively exploited in the wild, curated by ENISA and the EU CSIRT Network (`isExploited: true`).
- **`critical` (Critical CVSS Advisories):** High-severity vulnerabilities with normalized CVSS v3/v4 base scores, vector strings, and EPSS percentiles.
- **`latest` (Newest EUVD Publications):** Latest advisories published in the European Vulnerability Database.
- **`search` (Vendor / Product / CVSS / EPSS Filter):** Filter by keyword (`text`), `vendor` (e.g. `"Microsoft"`, `"Fortinet"`, `"Cisco"`, `"Linux"`), `product`, minimum CVSS score (`fromScore`), minimum EPSS score (`fromEpss`), and `exploited` status.
- **`lookup_by_id` (Direct CVE / EUVD Lookup):** Resolve any `CVE-YYYY-NNNN` or `EUVD-YYYY-NNNN` ID with full aliases, affected products/versions, remediation links, and references.

---

## Pay-Per-Event Pricing (`PAY_PER_EVENT`)

| Event Name | Price (USD) | Description |
|---|---|---|
| `actor-start` | **$0.01 / run** | Flat fee for starting an Actor run |
| `vulnerability-record` | **$0.002 / record** ($2.00 / 1,000) | Each normalized ENISA EUVD vulnerability record written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Licence:** Authorized under the [ENISA Legal Notice](https://www.enisa.europa.eu/about-enisa/legal-notice/legal-notice) (Section 1.2: reproduction and reuse authorized provided the source is acknowledged).
- **Mandatory Attribution on Every Record:** `Source: European Union Agency for Cybersecurity (ENISA) — European Vulnerability Database (EUVD, euvd.enisa.europa.eu), © European Union Agency for Cybersecurity. Reused with source acknowledgement under the ENISA Legal Notice.`

---

## Connect to Claude Desktop, Cursor & MCP Clients (Model Context Protocol)

You can use **`itulo/enisa-euvd-vulnerabilities`** as a live tool inside **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible AI agent in two ways:

### Option A: Hosted Apify MCP Server (`@apify/actors-mcp-server`)
Zero local setup required. Add this to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) or Cursor `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "enisa-euvd": {
      "command": "npx",
      "args": [
        "-y",
        "@apify/actors-mcp-server",
        "--actors",
        "itulo/enisa-euvd-vulnerabilities"
      ],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

### Option B: Local Stdio MCP Server (Open-Source CLI)
Run the bundled stdio MCP server (`src/mcp-server.js`) directly on your machine. Exposed MCP tools: `euvd_exploited_and_critical`, `euvd_search_vulnerabilities`, `euvd_lookup_by_id`, `euvd_licence_info`.

```json
{
  "mcpServers": {
    "enisa-euvd-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/tools/enisa-euvd-vulnerabilities/src/mcp-server.js"
      ]
    }
  }
}
```

---

## n8n, Make.com & REST API Integration (One-Call Sync JSON)

Trigger **`itulo/enisa-euvd-vulnerabilities`** synchronously and get the normalized JSON dataset items back in a single HTTP request — ideal for **n8n `HTTP Request` nodes**, **Make.com**, **Zapier**, or cron webhooks:

- **Method:** `POST`
- **Endpoint:** `https://api.apify.com/v2/acts/itulo~enisa-euvd-vulnerabilities/run-sync-get-dataset-items?token=YOUR_APIFY_API_TOKEN`
- **Headers:** `Content-Type: application/json`

### cURL Example

```bash
curl -s -X POST \
  "https://api.apify.com/v2/acts/itulo~enisa-euvd-vulnerabilities/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"modes":["exploited","critical"],"maxResults":25}'
```

---

## LangChain, CrewAI, Node.js & Python SDK Snippets

### Node.js (`apify-client`)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('itulo/enisa-euvd-vulnerabilities').call({
  "modes": [
    "exploited",
    "critical"
  ],
  "maxResults": 25
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

### Python (`apify-client` / LangChain `ApifyWrapper` / CrewAI)

```python
import os
from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])
run = client.actor("itulo/enisa-euvd-vulnerabilities").call(run_input={
  "modes": [
    "exploited",
    "critical"
  ],
  "maxResults": 25
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
    actor_id="itulo/enisa-euvd-vulnerabilities",
    run_input={
  "modes": [
    "exploited",
    "critical"
  ],
  "maxResults": 25
},
    dataset_mapping_function=lambda item: str(item),
)
docs = loader.load()
```

---

## Frequently Asked Questions (FAQ)

### What is the ENISA European Vulnerability Database (EUVD)?
Established under the EU NIS2 Directive (Directive (EU) 2022/2555), the ENISA European Vulnerability Database (`euvd.enisa.europa.eu`) is the official European Union vulnerability registry curating actively exploited vulnerabilities (`KEV`), critical CVSS advisories, EPSS exploitation probability scores, and affected vendor/product mappings alongside CVE identifiers.

### What query modes does the `enisa-euvd-vulnerabilities` actor support?
It supports five modes: `exploited` (latest actively exploited KEV vulnerabilities), `critical` (latest critical CVSS vulnerabilities), `latest` (newest EUVD entries), `search` (filter by `text`, `vendor`, `product`, `fromScore` CVSS 0–10, `fromEpss` 0–100, and `exploited` flag), and `lookup_by_id` (direct lookup by `CVE-YYYY-NNNN` or `EUVD-YYYY-NNNN`).

### Does this actor require an API key?
No. The official ENISA EUVD REST API (`euvdservices.enisa.europa.eu/api`) is keyless public threat intelligence reusable with ENISA source acknowledgement.

**Related Search Keywords:** ENISA EUVD API · European Vulnerability Database API · NIS2 Vulnerability Management Feed · EU Known Exploited Vulnerabilities (KEV) API · CVE & EUVD EPSS CVSS Threat Intelligence · ENISA EUVD MCP Server
