# FMI Weather + Fingrid Wind/Solar Nowcast Feed (`itulo/fmi-fingrid-nowcast`)

Hourly joined feature feed combining **Finnish Meteorological Institute (FMI)** WFS point weather forecasts across Finland's primary wind, solar, and demand hubs (`Oulu`, `Vaasa`, `Pori`, `Helsinki`, `Lappeenranta`) with **Fingrid Open Data** wind generation forecast (`245`), solar generation forecast (`248`), electricity consumption forecast (`166`), and actual wind generation (`75`).

Ships as both a **Pay-Per-Event Apify Actor** (`itulo/fmi-fingrid-nowcast`) and an open-source **stdio MCP Server** (`src/mcp-server.js`).

> **Independent Tool Notice:** Not affiliated with or endorsed by Fingrid Oyj or Ilmatieteen laitos (FMI). Uses zero Nord Pool or ENTSO-E day-ahead electricity exchange price data.

---

## Built for EV Smart-Charging, Home Automation & Nordic Energy Analytics

- **EV Smart-Charging Windows (`isEvChargeRecommended`):** Ranks the next 36 hours by renewable share (`windSolarSharePct`) and low residual load (`residualLoadMW`) without relying on restricted power-exchange spot prices.
- **Wind Hub & Storm Cut-Out Risk (`fmiStormCutoutRisk`):** Weights Ostrobothnia & West Coast wind hubs (`Oulu`, `Vaasa`, `Pori`) and flags turbine storm cut-out risk when hub gusts approach 25 m/s.
- **Demand-Weighted Heating Degree Hours (`fmiHeatingDegreeHoursC`):** Computes hourly heating demand pressure across southern and northern population centers alongside 1-hour wind & residual load ramps (`windRamp1hMW`, `residualRamp1hMW`).

---

## Pay-Per-Event Pricing (`PAY_PER_EVENT`)

| Event Name | Price (USD) | Description |
|---|---|---|
| `actor-start` | **$0.01 / run** | Flat fee for starting an Actor run |
| `nowcast-hour` | **$0.001 / hour** ($1.00 / 1,000) | Each joined FMI weather + Fingrid wind/solar/consumption hourly record written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Fingrid Attribution:** `Source Fingrid / data.fingrid.fi, license CC 4.0 BY` ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/))
- **FMI Attribution:** `Ilmatieteen laitoksen avoin data, sääennusteet (WFS) (EN: Finnish Meteorological Institute open data, SmartMet / HARMONIE-MEPS surface weather point forecast (WFS)), CC BY 4.0` ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.fi))

---

## Connect to Claude Desktop, Cursor & MCP Clients (Model Context Protocol)

You can use **`itulo/fmi-fingrid-nowcast`** as a live tool inside **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible AI agent in two ways:

### Option A: Hosted Apify MCP Server (`@apify/actors-mcp-server`)
Zero local setup required. Add this to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) or Cursor `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "fmi-fingrid-nowcast": {
      "command": "npx",
      "args": [
        "-y",
        "@apify/actors-mcp-server",
        "--actors",
        "itulo/fmi-fingrid-nowcast"
      ],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

### Option B: Local Stdio MCP Server (Open-Source CLI)
Run the bundled stdio MCP server (`src/mcp-server.js`) directly on your machine. Exposed MCP tools: `fmi_fingrid_nowcast`, `fmi_station_weather`, `fmi_fingrid_licence_info`.

```json
{
  "mcpServers": {
    "fmi-fingrid-nowcast-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/tools/fmi-fingrid-nowcast/src/mcp-server.js"
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

Trigger **`itulo/fmi-fingrid-nowcast`** synchronously and get the normalized JSON dataset items back in a single HTTP request — ideal for **n8n `HTTP Request` nodes**, **Make.com**, **Zapier**, or cron webhooks:

- **Method:** `POST`
- **Endpoint:** `https://api.apify.com/v2/acts/itulo~fmi-fingrid-nowcast/run-sync-get-dataset-items?token=YOUR_APIFY_API_TOKEN`
- **Headers:** `Content-Type: application/json`

### cURL Example

```bash
curl -s -X POST \
  "https://api.apify.com/v2/acts/itulo~fmi-fingrid-nowcast/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"mode":"joined_nowcast","places":["Oulu","Vaasa","Pori","Helsinki","Lappeenranta"],"hoursBack":6,"hoursAhead":36,"topN":6,"includeStationBreakdown":false}'
```

---

## LangChain, CrewAI, Node.js & Python SDK Snippets

### Node.js (`apify-client`)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('itulo/fmi-fingrid-nowcast').call({
  "mode": "joined_nowcast",
  "places": [
    "Oulu",
    "Vaasa",
    "Pori",
    "Helsinki",
    "Lappeenranta"
  ],
  "hoursBack": 6,
  "hoursAhead": 36,
  "topN": 6,
  "includeStationBreakdown": false
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

### Python (`apify-client` / LangChain `ApifyWrapper` / CrewAI)

```python
import os
from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])
run = client.actor("itulo/fmi-fingrid-nowcast").call(run_input={
  "mode": "joined_nowcast",
  "places": [
    "Oulu",
    "Vaasa",
    "Pori",
    "Helsinki",
    "Lappeenranta"
  ],
  "hoursBack": 6,
  "hoursAhead": 36,
  "topN": 6,
  "includeStationBreakdown": false
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
    actor_id="itulo/fmi-fingrid-nowcast",
    run_input={
  "mode": "joined_nowcast",
  "places": [
    "Oulu",
    "Vaasa",
    "Pori",
    "Helsinki",
    "Lappeenranta"
  ],
  "hoursBack": 6,
  "hoursAhead": 36,
  "topN": 6,
  "includeStationBreakdown": false
},
    dataset_mapping_function=lambda item: str(item),
)
docs = loader.load()
```

---

## Frequently Asked Questions (FAQ)

### How does this actor combine FMI meteorological forecasts with Fingrid grid forecasts?
It fetches hourly HARMONIE-MEPS surface weather point forecasts from the Finnish Meteorological Institute (FMI WFS 2.0) across Finland’s primary wind, solar, and demand hubs (`Oulu`, `Vaasa`, `Pori`, `Helsinki`, `Lappeenranta`) and joins them by UTC hour with Fingrid Open Data wind generation forecast (`245`), solar forecast (`248`), consumption forecast (`166`), and 15-min actual wind generation (`75`).

### What derived energy & EV smart-charging signals are included?
Each hourly record includes capacity-weighted hub wind speed (`fmiWindSpeedWeightedMs`), max hub wind gusts & storm cut-out risk (`fmiStormCutoutRisk` at >=25 m/s), demand-weighted temperature & heating degree hours (`fmiHeatingDegreeHoursC`), 1-hour wind and residual load ramps (`windRamp1hMW`, `residualRamp1hMW`), and an EV smart-charging recommendation rank (`isEvChargeRecommended`, `nowcastScore`).

### Does `weather_only` mode work without a Fingrid API key?
Yes! Set `mode: "weather_only"` (or call the `fmi_station_weather` MCP tool) to run 100% keyless using only FMI WFS open data. For `joined_nowcast` or `ev_charging_windows`, pass your free `fingridApiKey`.

**Related Search Keywords:** Finland Wind & Solar Nowcast API · FMI Weather + Fingrid Grid Forecast · EV Smart Charging API Finland · Nordic Power Balancing Weather Feed · Heating Degree Hours & Wind Ramp Finland · FMI Fingrid MCP Server
