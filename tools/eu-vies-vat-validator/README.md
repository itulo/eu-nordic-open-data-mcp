# EU VIES VAT Number Batch Validator & Reverse-Charge Check (`itulo/eu-vies-vat-validator`)

Batch-validate **European Union (EU-27) and Northern Ireland (`XI`) VAT numbers** against the official **European Commission VIES (VAT Information Exchange System) REST API** (`ec.europa.eu/taxation_customs/vies/rest-api`), with cross-border B2B reverse-charge flags, national VAT gateway health status, and **automatic GDPR sole-trader personal data redaction**.

Ships as both a **Pay-Per-Event Apify Actor** (`itulo/eu-vies-vat-validator`) and an open-source **stdio MCP Server** (`src/mcp-server.js`).

> **Independent Tool Notice:** Not affiliated with or endorsed by the European Commission or national tax administrations; uses no EU or VIES logos.

---

## Key Features for B2B Invoicing, ERP Onboarding & Tax Automation

- **Batch EU & XI VAT Validation (`validate_batch`):** Accepts VAT numbers in any format (`FI01120389`, `FI 0112038-9`, `DE123456789`, `SE556012579001`, `XI...`), normalizes country prefixes (including Greece `EL`/`GR`), and validates against the live European Commission VIES REST endpoint.
- **Automatic GDPR Sole-Trader Redaction:** Detects corporate legal forms (`Oy`, `Abp`, `AB`, `AS`, `GmbH`, `AG`, `B.V.`, `N.V.`, `S.A.`, `SAS`, `SARL`, `S.r.l.`, `S.L.`, `Sp. z o.o.`, `Ltd`, `PLC`, etc.) and redacts natural-person names, home addresses, and `c/o` lines when a VAT number belongs to an individual sole proprietor.
- **Cross-Border B2B Reverse-Charge Helper:** Pass `supplierCountryCode` (e.g. `"FI"`) to compute `isCrossBorderEuB2B` and `reverseChargeCandidate` on every validated customer.
- **Member State Gateway Uptime Check (`check_status`):** Check which of the 28 national EU/XI VAT databases are currently `Available` vs. undergoing maintenance.

---

## Pay-Per-Event Pricing (`PAY_PER_EVENT`)

| Event Name | Price (USD) | Description |
|---|---|---|
| `actor-start` | **$0.01 / run** | Flat fee for starting an Actor run |
| `vat-check` | **$0.0025 / check** ($2.50 / 1,000) | Each EU/XI VAT number validated against VIES or Member State status row written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Licence:** Reused under **European Commission Decision 2011/833/EU** and the official VIES Specific Disclaimer ([ec.europa.eu/taxation_customs/vies](https://ec.europa.eu/taxation_customs/vies/)).
- **Mandatory Attribution on Every Record:** `Source: European Commission, VIES (VAT Information Exchange System, ec.europa.eu/taxation_customs/vies), retrieved from national EU Member State VAT databases. Reused under Commission Decision 2011/833/EU. Company-level data only; sole-trader personal names/addresses redacted.`

---

## Connect to Claude Desktop, Cursor & MCP Clients (Model Context Protocol)

You can use **`itulo/eu-vies-vat-validator`** as a live tool inside **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible AI agent in two ways:

### Option A: Hosted Apify MCP Server (`@apify/actors-mcp-server`)
Zero local setup required. Add this to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) or Cursor `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "eu-vies-vat": {
      "command": "npx",
      "args": [
        "-y",
        "@apify/actors-mcp-server",
        "--actors",
        "itulo/eu-vies-vat-validator"
      ],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

### Option B: Local Stdio MCP Server (Open-Source CLI)
Run the bundled stdio MCP server (`src/mcp-server.js`) directly on your machine. Exposed MCP tools: `vies_validate_vat_batch`, `vies_member_state_status`, `vies_licence_info`.

```json
{
  "mcpServers": {
    "eu-vies-vat-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/tools/eu-vies-vat-validator/src/mcp-server.js"
      ]
    }
  }
}
```

---

## n8n, Make.com & REST API Integration (One-Call Sync JSON)

Trigger **`itulo/eu-vies-vat-validator`** synchronously and get the normalized JSON dataset items back in a single HTTP request — ideal for **n8n `HTTP Request` nodes**, **Make.com**, **Zapier**, or cron webhooks:

- **Method:** `POST`
- **Endpoint:** `https://api.apify.com/v2/acts/itulo~eu-vies-vat-validator/run-sync-get-dataset-items?token=YOUR_APIFY_API_TOKEN`
- **Headers:** `Content-Type: application/json`

### cURL Example

```bash
curl -s -X POST \
  "https://api.apify.com/v2/acts/itulo~eu-vies-vat-validator/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"mode":"validate_batch","vatNumbers":["FI01120389","FI10728943"],"supplierCountryCode":"FI","includeMemberStateStatus":false}'
```

---

## LangChain, CrewAI, Node.js & Python SDK Snippets

### Node.js (`apify-client`)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('itulo/eu-vies-vat-validator').call({
  "mode": "validate_batch",
  "vatNumbers": [
    "FI01120389",
    "FI10728943"
  ],
  "supplierCountryCode": "FI",
  "includeMemberStateStatus": false
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

### Python (`apify-client` / LangChain `ApifyWrapper` / CrewAI)

```python
import os
from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])
run = client.actor("itulo/eu-vies-vat-validator").call(run_input={
  "mode": "validate_batch",
  "vatNumbers": [
    "FI01120389",
    "FI10728943"
  ],
  "supplierCountryCode": "FI",
  "includeMemberStateStatus": false
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
    actor_id="itulo/eu-vies-vat-validator",
    run_input={
  "mode": "validate_batch",
  "vatNumbers": [
    "FI01120389",
    "FI10728943"
  ],
  "supplierCountryCode": "FI",
  "includeMemberStateStatus": false
},
    dataset_mapping_function=lambda item: str(item),
)
docs = loader.load()
```

---

## Frequently Asked Questions (FAQ)

### Why does this EU VIES VAT Validator redact sole-trader (toiminimi) names and addresses?
Several national EU VAT databases (including Finland, Poland, and Ireland) return a natural person’s full name and home address when a VAT number belongs to a sole proprietor (`toiminimi` / `Einzelunternehmen`). To keep your ERP, Stripe/invoicing workflow, and AI agents strictly company-level and GDPR-compliant, this tool verifies corporate legal form markers (`Oy`, `Ab`, `GmbH`, `Ltd`, `B.V.`, `S.A.`, `S.r.l.`, `Sp. z o.o.`, etc.) and automatically redacts sole-trader personal names, street addresses, and `c/o` lines.

### How does the cross-border EU B2B reverse-charge flag (`reverseChargeCandidate`) work?
When you provide `supplierCountryCode` (e.g. `"FI"`), any validated customer VAT number that is active (`valid: true`) in a different EU Member State (e.g. `"DE"`, `"SE"`, `"NL"`) is automatically flagged with `isCrossBorderEuB2B: true` and `reverseChargeCandidate: true` for VAT Art. 196 reverse-charge invoicing workflows.

### Does it support official VIES consultation numbers (`requestIdentifier`) for tax audits?
Yes. Pass `requesterMemberStateCode` and `requesterNumber` (your own EU VAT number) to receive the official national tax authority `requestIdentifier` token on every validation record.

**Related Search Keywords:** VIES VAT Validation API · EU VAT Number Batch Check API · European Commission VIES REST API · B2B Intra-EU Reverse Charge VAT Check · GDPR Compliant VIES VAT Lookup · EU VIES VAT MCP Server
