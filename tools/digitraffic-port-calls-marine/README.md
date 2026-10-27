# Baltic & Finland Vessel Port Calls & Port Congestion — Digitraffic Marine API (`itulo/digitraffic-port-calls-marine`)

Real-time and scheduled **Baltic Sea & Finnish maritime vessel port calls**, berth ETA/ETD schedules, planned turnaround durations, corporate shipping agents, and per-port congestion metrics powered by **Fintraffic Digitraffic Marine Open Data** (`meri.digitraffic.fi/api/port-call/v1/port-calls`; keyless CC BY 4.0).

Ships as both a **Pay-Per-Event Apify Actor** (`itulo/digitraffic-port-calls-marine`) and an open-source **stdio MCP Server** (`src/mcp-server.js`).

> **Independent Tool Notice:** Not affiliated with or endorsed by Fintraffic; uses no Fintraffic or Digitraffic logos.

---

## Supported Modes for Maritime & Supply-Chain Automation

- **`port_calls` (Normalized Vessel Arrivals & Departures):** Filter by UN/LOCODE port (`FIHEL` Helsinki, `FITKU` Turku, `FIHKO` Hanko, `FIKTK` Kotka, `FIHMN` Hamina, `FIRAU` Rauma, `FIOUL` Oulu), vessel name, IMO number, ETA window, and `cargoOnly`. Outputs `portToVisit`, `prevPort`, `nextPort`, `portAreaName`, `berthName`, `vesselName`, `imoLloyds`, `radioCallSign`, `nationality`, `vesselTypeCode`, `arrivalWithCargo`, `etaUtc`, `etdUtc`, `plannedTurnaroundHours`, and corporate `shippingAgents`.
- **`port_congestion_summary` (Port-Level Turnaround & Berth Load):** Computes `totalPortCalls`, `cargoPortCalls`, `cargoSharePct`, `avgPlannedTurnaroundHours`, `activeBerthsCount`, and `flagStatesCount` per port.
- **GDPR By Design:** Strips `shipMasterArrival`, `shipMasterDeparture`, and free-text security notes, and restricts `shippingAgents` to corporate legal entities.

---

## Pay-Per-Event Pricing (`PAY_PER_EVENT`)

| Event Name | Price (USD) | Description |
|---|---|---|
| `actor-start` | **$0.01 / run** | Flat fee for starting an Actor run |
| `port-call-record` | **$0.0015 / record** ($1.50 / 1,000) | Each normalized vessel port call schedule or port congestion summary row written to the dataset (primary event) |

---

## Data Licence & Attribution Compliance

- **Licence:** Creative Commons Attribution 4.0 International ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
- **Mandatory Attribution on Every Record:** `Source: Fintraffic / digitraffic.fi, license CC 4.0 BY`

---

## Connect to Claude Desktop, Cursor & MCP Clients (Model Context Protocol)

You can use **`itulo/digitraffic-port-calls-marine`** as a live tool inside **Claude Desktop**, **Cursor**, **Windsurf**, or any MCP-compatible AI agent in two ways:

### Option A: Hosted Apify MCP Server (`@apify/actors-mcp-server`)
Zero local setup required. Add this to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`) or Cursor `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "digitraffic-marine": {
      "command": "npx",
      "args": [
        "-y",
        "@apify/actors-mcp-server",
        "--actors",
        "itulo/digitraffic-port-calls-marine"
      ],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

### Option B: Local Stdio MCP Server (Open-Source CLI)
Run the bundled stdio MCP server (`src/mcp-server.js`) directly on your machine. Exposed MCP tools: `digitraffic_port_calls`, `digitraffic_port_congestion_summary`, `digitraffic_licence_info`.

```json
{
  "mcpServers": {
    "digitraffic-marine-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/tools/digitraffic-port-calls-marine/src/mcp-server.js"
      ]
    }
  }
}
```

---

## n8n, Make.com & REST API Integration (One-Call Sync JSON)

Trigger **`itulo/digitraffic-port-calls-marine`** synchronously and get the normalized JSON dataset items back in a single HTTP request — ideal for **n8n `HTTP Request` nodes**, **Make.com**, **Zapier**, or cron webhooks:

- **Method:** `POST`
- **Endpoint:** `https://api.apify.com/v2/acts/itulo~digitraffic-port-calls-marine/run-sync-get-dataset-items?token=YOUR_APIFY_API_TOKEN`
- **Headers:** `Content-Type: application/json`

### cURL Example

```bash
curl -s -X POST \
  "https://api.apify.com/v2/acts/itulo~digitraffic-port-calls-marine/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"modes":["port_calls","port_congestion_summary"],"ports":["FIHEL","FITKU","FIHKO","FIKTK"],"cargoOnly":false,"maxResults":30}'
```

---

## LangChain, CrewAI, Node.js & Python SDK Snippets

### Node.js (`apify-client`)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('itulo/digitraffic-port-calls-marine').call({
  "modes": [
    "port_calls",
    "port_congestion_summary"
  ],
  "ports": [
    "FIHEL",
    "FITKU",
    "FIHKO",
    "FIKTK"
  ],
  "cargoOnly": false,
  "maxResults": 30
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(items);
```

### Python (`apify-client` / LangChain `ApifyWrapper` / CrewAI)

```python
import os
from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])
run = client.actor("itulo/digitraffic-port-calls-marine").call(run_input={
  "modes": [
    "port_calls",
    "port_congestion_summary"
  ],
  "ports": [
    "FIHEL",
    "FITKU",
    "FIHKO",
    "FIKTK"
  ],
  "cargoOnly": false,
  "maxResults": 30
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
    actor_id="itulo/digitraffic-port-calls-marine",
    run_input={
  "modes": [
    "port_calls",
    "port_congestion_summary"
  ],
  "ports": [
    "FIHEL",
    "FITKU",
    "FIHKO",
    "FIKTK"
  ],
  "cargoOnly": false,
  "maxResults": 30
},
    dataset_mapping_function=lambda item: str(item),
)
docs = loader.load()
```

---

## Frequently Asked Questions (FAQ)

### Which maritime ports and vessel identifiers are supported?
It queries the official Fintraffic Digitraffic Marine Port Call REST API (`meri.digitraffic.fi/api/port-call/v1/port-calls`) covering all Finnish and Baltic UN/LOCODE ports (`FIHEL` Helsinki, `FIKTK` Kotka, `FIHMN` Hamina, `FITKU` Turku, `FIHKO` Hanko, `FIRAU` Rauma, `FIOUL` Oulu, etc.). You can filter by `ports`, `vesselName`, `imoNumber`, `cargoOnly`, and `etaFrom`/`etaTo`.

### What does `port_congestion_summary` calculate?
It aggregates active and scheduled vessel calls per UN/LOCODE port, returning `totalPortCalls`, `cargoPortCalls`, `cargoSharePct`, `avgPlannedTurnaroundHours`, `activeBerthsCount`, `flagStatesCount`, and the earliest/latest ETA window for supply-chain bottleneck monitoring.

### How are ship master personal names handled for GDPR compliance?
Raw Digitraffic port call payloads can include natural-person ship master names (`shipMasterArrival`, `shipMasterDeparture`). This tool explicitly drops all master/crew personal fields and filters `shippingAgents` to corporate entities only (`Oy`, `Ab`, `Ltd`, `Shipping`, `Logistics`, `Agency`, etc.).

**Related Search Keywords:** Digitraffic Port Calls API · Baltic Sea Vessel Schedule & ETA API · Finland Maritime Port Congestion API · Fintraffic Marine Open Data API · Port of Helsinki Kotka Hamina Turku Vessel Arrivals · Digitraffic Marine MCP Server
