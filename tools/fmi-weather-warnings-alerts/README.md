# Finland Severe Weather & Baltic Marine Alerts — FMI CAP & WFS API (`itulo/fmi-weather-warnings-alerts`)

Real-time **Finnish Meteorological Institute (FMI)** CAP 1.2 severe weather, storm wind, Baltic wave height, vessel icing, sea-level, and traffic warnings (`alerts.fmi.fi`) combined with live WFS 2.0 synoptic weather station observations and Baltic Sea mareograph sea-level readings (`opendata.fmi.fi/wfs`).

Keyless, clean **CC BY 4.0** open data built for Nordic logistics, maritime port operations, power grid resilience, construction scheduling, and property risk automation.

Ships as both a **Pay-Per-Event Apify Actor** (`itulo/fmi-weather-warnings-alerts`) and an open-source **stdio MCP Server** (`src/mcp-server.js`).

> **Independent Tool Notice:** Not affiliated with or endorsed by Ilmatieteen laitos (FMI); uses no FMI logo.

---

## Supported Modes

- **`active_alerts` (CAP 1.2 Severe Weather & Marine Warnings):** Normalized alerts with severity (`Minor`, `Moderate`, `Severe`, `Extreme`), alert color (`yellow`, `orange`, `red`), onset/expiry UTC timestamps, affected Finnish land municipalities and Baltic sea sub-basins, polygon bounding boxes, physical impact summaries, and `isGridOrMarineRisk` flags.
- **`weather_observations` (Synoptic Weather Stations):** Latest 2m air temperature, 10-min average wind speed, max wind gust, wind direction, relative humidity, 1h precipitation, snow depth, sea-level pressure, and visibility across Finnish cities.
- **`sea_level_observations` (Baltic Sea Mareographs):** Latest Baltic Sea water level (`seaLevelMm` relative to theoretical mean water) and water temperature across Finnish coastal mareograph stations (Helsinki, Turku, Hanko, Hamina, Rauma, Vaasa, Oulu, Kemi, etc.).

---

## Pay-Per-Event Pricing (`PAY_PER_EVENT`)

| Event Name | Price (USD) | Description |
|---|---|---|
| `actor-start` | **$0.01 / run** | Flat fee for starting an Actor run |
| `weather-alert-or-obs` | **$0.0015 / record** ($1.50 / 1,000) | Each normalized FMI CAP alert, synoptic weather observation, or Baltic mareograph sea-level observation written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Licence:** Creative Commons Attribution 4.0 International ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.fi)).
- **Mandatory Attribution on Every Record:** `Ilmatieteen laitoksen avoin data, <dataset> (EN: Finnish Meteorological Institute open data, <dataset>), CC BY 4.0`

---

## Connect to Claude Desktop, Cursor & MCP Clients (Model Context Protocol)

You can use **`itulo/fmi-weather-warnings-alerts`** as a live tool inside **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible AI agent in two ways:

### Option A: Hosted Apify MCP Server (`@apify/actors-mcp-server`)
Zero local setup required. Add this to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) or Cursor `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "fmi-weather-alerts": {
      "command": "npx",
      "args": [
        "-y",
        "@apify/actors-mcp-server",
        "--actors",
        "itulo/fmi-weather-warnings-alerts"
      ],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

### Option B: Local Stdio MCP Server (Open-Source CLI)
Run the bundled stdio MCP server (`src/mcp-server.js`) directly on your machine. Exposed MCP tools: `fmi_active_alerts`, `fmi_weather_observations`, `fmi_sea_level_observations`, `fmi_alerts_licence_info`.

```json
{
  "mcpServers": {
    "fmi-weather-alerts-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/tools/fmi-weather-warnings-alerts/src/mcp-server.js"
      ]
    }
  }
}
```

---

## n8n, Make.com & REST API Integration (One-Call Sync JSON)

Trigger **`itulo/fmi-weather-warnings-alerts`** synchronously and get the normalized JSON dataset items back in a single HTTP request — ideal for **n8n `HTTP Request` nodes**, **Make.com**, **Zapier**, or cron webhooks:

- **Method:** `POST`
- **Endpoint:** `https://api.apify.com/v2/acts/itulo~fmi-weather-warnings-alerts/run-sync-get-dataset-items?token=YOUR_APIFY_API_TOKEN`
- **Headers:** `Content-Type: application/json`

### cURL Example

```bash
curl -s -X POST \
  "https://api.apify.com/v2/acts/itulo~fmi-weather-warnings-alerts/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"modes":["active_alerts","weather_observations","sea_level_observations"],"language":"en-GB","minSeverity":"Minor","maxAlerts":20,"places":["Helsinki","Turku","Tampere","Vaasa","Oulu","Rovaniemi"],"hoursBack":2,"maxSeaStations":10}'
```

---

## LangChain, CrewAI, Node.js & Python SDK Snippets

### Node.js (`apify-client`)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('itulo/fmi-weather-warnings-alerts').call({
  "modes": [
    "active_alerts",
    "weather_observations",
    "sea_level_observations"
  ],
  "language": "en-GB",
  "minSeverity": "Minor",
  "maxAlerts": 20,
  "places": [
    "Helsinki",
    "Turku",
    "Tampere",
    "Vaasa",
    "Oulu",
    "Rovaniemi"
  ],
  "hoursBack": 2,
  "maxSeaStations": 10
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

### Python (`apify-client` / LangChain `ApifyWrapper` / CrewAI)

```python
import os
from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])
run = client.actor("itulo/fmi-weather-warnings-alerts").call(run_input={
  "modes": [
    "active_alerts",
    "weather_observations",
    "sea_level_observations"
  ],
  "language": "en-GB",
  "minSeverity": "Minor",
  "maxAlerts": 20,
  "places": [
    "Helsinki",
    "Turku",
    "Tampere",
    "Vaasa",
    "Oulu",
    "Rovaniemi"
  ],
  "hoursBack": 2,
  "maxSeaStations": 10
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
    actor_id="itulo/fmi-weather-warnings-alerts",
    run_input={
  "modes": [
    "active_alerts",
    "weather_observations",
    "sea_level_observations"
  ],
  "language": "en-GB",
  "minSeverity": "Minor",
  "maxAlerts": 20,
  "places": [
    "Helsinki",
    "Turku",
    "Tampere",
    "Vaasa",
    "Oulu",
    "Rovaniemi"
  ],
  "hoursBack": 2,
  "maxSeaStations": 10
},
    dataset_mapping_function=lambda item: str(item),
)
docs = loader.load()
```

---

## Frequently Asked Questions (FAQ)

### Which official FMI feeds does this actor combine?
It combines three official, keyless Finnish Meteorological Institute (FMI) open-data feeds: (1) CAP 1.2 severe weather & marine alerts (`alerts.fmi.fi/cap/feed/atom_en-GB.xml`), (2) live 10-minute synoptic weather observations (`fmi::observations::weather::simple`), and (3) live Baltic Sea mareograph water-level observations (`fmi::observations::mareograph::simple`).

### Can I filter FMI alerts by severity, land vs. sea area, or language?
Yes. Set `minSeverity` (`Minor`, `Moderate`, `Severe`, `Extreme`), `areaFilter` (region name or sea area such as `Gulf of Finland`, `Bothnian Sea`, `Uusimaa`), `gridOrMarineOnly: true` (wind, storm, wave, sea-level, icing), and `language` (`en-GB`, `fi-FI`, `sv-FI`).

### Does this actor require an API key?
No. All three FMI CAP and WFS 2.0 endpoints are official keyless CC BY 4.0 open data.

**Related Search Keywords:** FMI Weather Warnings API · Finland CAP 1.2 Severe Weather Alerts API · Baltic Sea Wave & Wind Warnings API · Finnish Meteorological Institute WFS Open Data · Finland Mareograph Sea Level API · FMI Weather MCP Server
