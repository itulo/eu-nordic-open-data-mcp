# Finnish Power Grid & Reserve Signals — Fingrid Open Data API (`itulo/fingrid-grid-signals`)

Real-time and forecast **Finnish electricity transmission system data** from the official **Fingrid Open Data API** (`data.fingrid.fi/api`): national power consumption & generation, wind & solar forecasts, frequency (`177`), FCR/aFRR/mFRR/FFR reserve capacity prices, imbalance power prices (`319`), real-time CO2 emission intensity (`396`), and derived **low-residual-load / low-carbon hour rankings**.

Ships as both a **Pay-Per-Event Apify Actor** (`itulo/fingrid-grid-signals`) and an open-source **stdio MCP Server** (`src/mcp-server.js`).

> **Independent Tool Notice:** Not affiliated with or endorsed by Fingrid Oyj. Uses no Fingrid logo or look-alike UI, and uses **zero Nord Pool or electricity exchange spot price data**.

---

## Supported Modes & Fingrid Open Data Datasets

| Mode | Fingrid Datasets Included |
|---|---|
| `grid_snapshot` | `193` consumption, `192` production, `181` wind, `188` nuclear, `191` hydro, `194` net import, `177` frequency, `209` system state, `336` shortage status, `396` CO2 emission factor, `395` non-fossil share |
| `consumption_production` | `124`, `74`, `166` consumption forecast, `193`, `192` |
| `renewables` | `181` wind real-time, `75` wind 15-min, `245` wind forecast, `248` solar forecast |
| `reserves` | `317` FCR-N, `318`/`283` FCR-D up/down, `52`/`51` aFRR up/down, `329`/`330` mFRR capacity up/down, `277` FFR |
| `imbalance` | `319` imbalance price, `397` calculated imbalance, `244`/`106` up/down-regulation prices |
| `co2` | **Derived signal:** current grid CO2 factor (`396`) vs. rolling p25/median/p75 percentiles (`low` / `medium` / `high`) |
| `cheap_hours` | **Derived signal:** ranks the next `N` hours by lowest residual load (`166` consumption forecast − `245` wind forecast − `248` solar forecast) |
| `custom` | Any Fingrid dataset ID verified to have `organization == Fingrid` and `CC BY 4.0` licence |

---

## Pay-Per-Event Pricing (`PAY_PER_EVENT`)

| Event Name | Price (USD) | Description |
|---|---|---|
| `actor-start` | **$0.01 / run** | Flat fee for starting an Actor run |
| `derived-signal` | **$0.005 / signal** | Each derived `cheap_hours` ranking or `co2` intensity classification (primary event) |
| `data-records` | **$0.10 / 100 records** ($1.00 / 1,000) | Per 100 normalized Fingrid Open Data time-series records written to the dataset |

---

## Data Licence & Attribution Compliance

- **Licence:** Creative Commons Attribution 4.0 International ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
- **Mandatory Attribution on Every Record:** `Source Fingrid / data.fingrid.fi, license CC 4.0 BY` plus `modified: true` and `modificationNotice` on derived records.

---

## Connect to Claude Desktop, Cursor & MCP Clients (Model Context Protocol)

You can use **`itulo/fingrid-grid-signals`** as a live tool inside **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible AI agent in two ways:

### Option A: Hosted Apify MCP Server (`@apify/actors-mcp-server`)
Zero local setup required. Add this to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) or Cursor `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "fingrid-grid-signals": {
      "command": "npx",
      "args": [
        "-y",
        "@apify/actors-mcp-server",
        "--actors",
        "itulo/fingrid-grid-signals"
      ],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

### Option B: Local Stdio MCP Server (Open-Source CLI)
Run the bundled stdio MCP server (`src/mcp-server.js`) directly on your machine. Exposed MCP tools: `fingrid_grid_snapshot`, `fingrid_cheap_hours`, `fingrid_co2_intensity`, `fingrid_series`, `fingrid_dataset`, `fingrid_licence_info`.

```json
{
  "mcpServers": {
    "fingrid-grid-signals-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/tools/fingrid-grid-signals/src/mcp-server.js"
      ],
      "env": {
        "FINGRID_API_KEY": "YOUR_FREE_FINGRID_API_KEY"
      }
    }
  }
}
```

---

## n8n, Make.com & REST API Integration (One-Call Sync JSON)

Trigger **`itulo/fingrid-grid-signals`** synchronously and get the normalized JSON dataset items back in a single HTTP request — ideal for **n8n `HTTP Request` nodes**, **Make.com**, **Zapier**, or cron webhooks:

- **Method:** `POST`
- **Endpoint:** `https://api.apify.com/v2/acts/itulo~fingrid-grid-signals/run-sync-get-dataset-items?token=YOUR_APIFY_API_TOKEN`
- **Headers:** `Content-Type: application/json`

### cURL Example

```bash
curl -s -X POST \
  "https://api.apify.com/v2/acts/itulo~fingrid-grid-signals/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"modes":["grid_snapshot","cheap_hours","co2"],"hoursBack":24,"hoursAhead":36,"topN":6}'
```

---

## LangChain, CrewAI, Node.js & Python SDK Snippets

### Node.js (`apify-client`)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('itulo/fingrid-grid-signals').call({
  "modes": [
    "grid_snapshot",
    "cheap_hours",
    "co2"
  ],
  "hoursBack": 24,
  "hoursAhead": 36,
  "topN": 6
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

### Python (`apify-client` / LangChain `ApifyWrapper` / CrewAI)

```python
import os
from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])
run = client.actor("itulo/fingrid-grid-signals").call(run_input={
  "modes": [
    "grid_snapshot",
    "cheap_hours",
    "co2"
  ],
  "hoursBack": 24,
  "hoursAhead": 36,
  "topN": 6
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
    actor_id="itulo/fingrid-grid-signals",
    run_input={
  "modes": [
    "grid_snapshot",
    "cheap_hours",
    "co2"
  ],
  "hoursBack": 24,
  "hoursAhead": 36,
  "topN": 6
},
    dataset_mapping_function=lambda item: str(item),
)
docs = loader.load()
```

---

## Frequently Asked Questions (FAQ)

### Do I need a Fingrid API key to run this actor?
Yes. Register a free starter key in 2 minutes at `data.fingrid.fi` (Developer Portal) and pass it via the secret actor input `fingridApiKey` (or `FINGRID_API_KEY` environment variable in local MCP mode). Your key is sent only in the `x-api-key` request header to `data.fingrid.fi` and is never logged or stored.

### Does this actor use Nord Pool or ENTSO-E day-ahead electricity exchange prices?
No. It uses 100% clean CC BY 4.0 Fingrid Open Data datasets (`166` consumption forecast, `245` wind forecast, `248` solar forecast, `396` real-time CO2 factor, `319` imbalance price, and reserve capacity datasets). The `cheap_hours` signal ranks hours by residual load (`consumption − wind − solar`) as a physical grid heuristic, not an electricity exchange spot price forecast.

### How does the client respect Fingrid API rate limits?
The client batches dataset IDs into a single multi-dataset `/api/data` call and spaces requests by 2.1 seconds, using only ~3 requests per run (well inside Fingrid’s 10,000 requests/day limit).

**Related Search Keywords:** Fingrid Open Data API · Finnish Electricity Grid API · Finland Wind & Solar Generation Forecast API · Fingrid Reserve & Imbalance Power Prices · Finland Grid CO2 Emission Factor API · Fingrid MCP Server
