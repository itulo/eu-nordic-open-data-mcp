# ECB Official EUR Exchange Rates, Policy Rates, Inflation & Invoice Converter (`itulo/ecb-fx-rates-macro`)

All-in-one B2B accounting, ERP reconciliation, and macro-treasury feed powered by the official **European Central Bank (ECB) SDMX 2.1 Data Portal** (`data-api.ecb.europa.eu`):
1. **`fx_rates` (`EXR`)**: Daily & historical official EUR reference exchange rates for 30+ global currencies (`USD`, `GBP`, `SEK`, `NOK`, `DKK`, `CHF`, `JPY`, `PLN`, `CAD`, `AUD`, `CNY`, etc.) with both `ratePerEur` and `eurPerUnit`.
2. **`policy_rates` (`FM`)**: Eurosystem key interest rates — Deposit facility (`DFR`), Main refinancing operations (`MRR_FR`), and Marginal lending facility (`MLFR`).
3. **`hicp_inflation` (`ICP`)**: Euro Area (`U2`) and EU Member State (`FI`, `DE`, `FR`, `NL`, `SE`, etc.) HICP annual headline inflation rates.
4. **`invoice_converter`**: Batch B2B invoice & cross-currency reconciliation (`USD -> EUR`, `SEK -> EUR`, `USD -> SEK`, etc.) with automatic prior-business-day fallback on weekends and TARGET bank holidays.

Ships as both a **Pay-Per-Event Apify Actor** (`itulo/ecb-fx-rates-macro`) and an open-source **stdio MCP Server** (`src/mcp-server.js`).

> **Independent Tool Notice:** Not affiliated with or endorsed by the European Central Bank; uses no ECB logo. ECB reference rates are published for information purposes only.

---

## Pay-Per-Event Pricing (`PAY_PER_EVENT`)

| Event Name | Price (USD) | Description |
|---|---|---|
| `actor-start` | **$0.01 / run** | Flat fee for starting an Actor run |
| `macro-or-fx-record` | **$0.001 / record** ($1.00 / 1,000) | Each official ECB FX rate, policy interest rate, HICP inflation reading, or converted invoice row written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Licence:** Reused under the official [Policy regarding the reuse of ESCB statistics](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html).
- **Mandatory Attribution on Every Record:** `Source: ECB statistics (European Central Bank SDMX 2.1 Data Portal, data.ecb.europa.eu). Reused under the Policy regarding the reuse of ESCB statistics; reference rates are published for information purposes only.`

---

## Connect to Claude Desktop, Cursor & MCP Clients (Model Context Protocol)

You can use **`itulo/ecb-fx-rates-macro`** as a live tool inside **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible AI agent in two ways:

### Option A: Hosted Apify MCP Server (`@apify/actors-mcp-server`)
Zero local setup required. Add this to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) or Cursor `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ecb-fx-macro": {
      "command": "npx",
      "args": [
        "-y",
        "@apify/actors-mcp-server",
        "--actors",
        "itulo/ecb-fx-rates-macro"
      ],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

### Option B: Local Stdio MCP Server (Open-Source CLI)
Run the bundled stdio MCP server (`src/mcp-server.js`) directly on your machine. Exposed MCP tools: `ecb_fx_rates`, `ecb_policy_rates_and_inflation`, `ecb_convert_invoices`, `ecb_licence_info`.

```json
{
  "mcpServers": {
    "ecb-fx-macro-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/tools/ecb-fx-rates-macro/src/mcp-server.js"
      ]
    }
  }
}
```

---

## n8n, Make.com & REST API Integration (One-Call Sync JSON)

Trigger **`itulo/ecb-fx-rates-macro`** synchronously and get the normalized JSON dataset items back in a single HTTP request — ideal for **n8n `HTTP Request` nodes**, **Make.com**, **Zapier**, or cron webhooks:

- **Method:** `POST`
- **Endpoint:** `https://api.apify.com/v2/acts/itulo~ecb-fx-rates-macro/run-sync-get-dataset-items?token=YOUR_APIFY_API_TOKEN`
- **Headers:** `Content-Type: application/json`

### cURL Example

```bash
curl -s -X POST \
  "https://api.apify.com/v2/acts/itulo~ecb-fx-rates-macro/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"modes":["fx_rates","policy_rates","hicp_inflation","invoice_converter"],"currencies":["USD","GBP","SEK","NOK","DKK","CHF","JPY","PLN"],"lastNObservations":5,"inflationAreas":["U2","FI","DE","FR"],"invoices":[{"invoiceId":"INV-001","amount":1500,"fromCurrency":"USD","toCurrency":"EUR"},{"invoiceId":"INV-002","amount":25000,"fromCurrency":"SEK","toCurrency":"EUR"}]}'
```

---

## LangChain, CrewAI, Node.js & Python SDK Snippets

### Node.js (`apify-client`)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('itulo/ecb-fx-rates-macro').call({
  "modes": [
    "fx_rates",
    "policy_rates",
    "hicp_inflation",
    "invoice_converter"
  ],
  "currencies": [
    "USD",
    "GBP",
    "SEK",
    "NOK",
    "DKK",
    "CHF",
    "JPY",
    "PLN"
  ],
  "lastNObservations": 5,
  "inflationAreas": [
    "U2",
    "FI",
    "DE",
    "FR"
  ],
  "invoices": [
    {
      "invoiceId": "INV-001",
      "amount": 1500,
      "fromCurrency": "USD",
      "toCurrency": "EUR"
    },
    {
      "invoiceId": "INV-002",
      "amount": 25000,
      "fromCurrency": "SEK",
      "toCurrency": "EUR"
    }
  ]
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

### Python (`apify-client` / LangChain `ApifyWrapper` / CrewAI)

```python
import os
from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])
run = client.actor("itulo/ecb-fx-rates-macro").call(run_input={
  "modes": [
    "fx_rates",
    "policy_rates",
    "hicp_inflation",
    "invoice_converter"
  ],
  "currencies": [
    "USD",
    "GBP",
    "SEK",
    "NOK",
    "DKK",
    "CHF",
    "JPY",
    "PLN"
  ],
  "lastNObservations": 5,
  "inflationAreas": [
    "U2",
    "FI",
    "DE",
    "FR"
  ],
  "invoices": [
    {
      "invoiceId": "INV-001",
      "amount": 1500,
      "fromCurrency": "USD",
      "toCurrency": "EUR"
    },
    {
      "invoiceId": "INV-002",
      "amount": 25000,
      "fromCurrency": "SEK",
      "toCurrency": "EUR"
    }
  ]
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
    actor_id="itulo/ecb-fx-rates-macro",
    run_input={
  "modes": [
    "fx_rates",
    "policy_rates",
    "hicp_inflation",
    "invoice_converter"
  ],
  "currencies": [
    "USD",
    "GBP",
    "SEK",
    "NOK",
    "DKK",
    "CHF",
    "JPY",
    "PLN"
  ],
  "lastNObservations": 5,
  "inflationAreas": [
    "U2",
    "FI",
    "DE",
    "FR"
  ],
  "invoices": [
    {
      "invoiceId": "INV-001",
      "amount": 1500,
      "fromCurrency": "USD",
      "toCurrency": "EUR"
    },
    {
      "invoiceId": "INV-002",
      "amount": 25000,
      "fromCurrency": "SEK",
      "toCurrency": "EUR"
    }
  ]
},
    dataset_mapping_function=lambda item: str(item),
)
docs = loader.load()
```

---

## Frequently Asked Questions (FAQ)

### Which official European Central Bank (ECB) datasets does this tool query?
It queries the official ECB SDMX 2.1 REST API (`data-api.ecb.europa.eu/service/data`) across three core dataflows: `EXR` (daily & historical official EUR reference exchange rates for 30+ currencies), `FM` (Eurosystem official policy interest rates: Deposit Facility `DFR`, Main Refinancing Operations `MRR_FR`, Marginal Lending Facility `MLFR`), and `ICP` (Harmonised Index of Consumer Prices `HICP` annual inflation rates for the Euro Area `U2` and EU Member States).

### How does the B2B invoice converter handle weekends and TARGET bank holidays?
When converting an invoice on a weekend or TARGET closing day (or when no date is specified), `invoice_converter` automatically resolves the most recent published ECB reference rate on or before the target date and returns `effectiveRateDate`, `rateUsed`, `inverseRateUsed`, and the rounded `convertedAmount` — supporting both EUR conversions (`USD -> EUR`) and triangular cross-currency pairs (`USD -> SEK` via EUR).

### Does this actor require an API key?
No. All ECB SDMX 2.1 endpoints are official keyless open statistics.

**Related Search Keywords:** ECB Exchange Rates API · European Central Bank SDMX 2.1 JSON API · Official EUR Reference FX Rates · ECB Deposit Facility & Policy Interest Rates API · Eurozone HICP Inflation API · B2B Multi-Currency Invoice Converter EUR · ECB FX MCP Server
