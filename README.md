# EU & Nordic Official Open-Data MCP Servers & Apify Actors (`eu-nordic-open-data-mcp`)

10 production-ready **Model Context Protocol (MCP) servers** (`@modelcontextprotocol/sdk` over stdio) and **Apify Actors** built on official European Union and Finnish government open-data APIs.

Every tool shares a single core library (`src/lib/*`) across its **stdio MCP server** (`src/mcp-server.js`) and **Apify Actor** (`src/main.js`), and enforces:
1. **Strict GDPR Personal-Data Redaction by Design:** Organisation-level whitelists strip sole-trader (`toiminimi`) personal names & residential addresses in VIES VAT checks, `c/o` names & street addresses in PRH Trade Register records, natural-person contact points in TED procurement notices, and ship master names in Digitraffic port calls.
2. **Mandatory Licence & Attribution Envelope:** Every output record and MCP tool response (including error responses) embeds the exact legal attribution, licence URL, and reuse notice verified in [`LICENCE_REGISTER.md`](./LICENCE_REGISTER.md) and [`licences.json`](./licences.json).
3. **Zero Proprietary Exchange Price Data:** Power grid tools use 100% CC BY 4.0 Fingrid & FMI physical grid and meteorological datasets (zero Nord Pool or ENTSO-E day-ahead electricity exchange prices).

> **Independent Open-Source Suite:** Not affiliated with or endorsed by the Publications Office of the EU, European Commission, ECB, ENISA, PRH, Fingrid, FMI, or Fintraffic. Uses no agency or EU logos.

---

## All 10 Tools at a Glance

| # | Tool Directory | Hosted Apify Actor | Official Upstream API | Keyless? | MCP Tools Exposed |
|---|---|---|---|---|---|
| **1** | [`tools/ted-tender-feed`](./tools/ted-tender-feed) | [`itulo/ted-tender-feed`](https://apify.com/itulo/ted-tender-feed) | EU TED Search API v3 (`api.ted.europa.eu/v3`) | Yes | `ted_search_tenders`, `ted_new_tenders_alert`, `ted_licence_info` |
| **2** | [`tools/prh-company-events`](./tools/prh-company-events) | [`itulo/prh-company-events`](https://apify.com/itulo/prh-company-events) | Finland PRH / YTJ Open Data v3 (`avoindata.prh.fi`) | Yes | `prh_company_events`, `prh_watch_companies`, `prh_licence_info` |
| **3** | [`tools/eu-sanctions-screen`](./tools/eu-sanctions-screen) | [`itulo/eu-sanctions-screen`](https://apify.com/itulo/eu-sanctions-screen) | European Commission DG FISMA Consolidated Financial Sanctions (FSF CSV 1.1) | Yes | `eu_sanctions_screen`, `eu_sanctions_lookup`, `eu_sanctions_list_info` |
| **4** | [`tools/fingrid-grid-signals`](./tools/fingrid-grid-signals) | [`itulo/fingrid-grid-signals`](https://apify.com/itulo/fingrid-grid-signals) | Fingrid Open Data API (`data.fingrid.fi/api`) | Free key (`FINGRID_API_KEY`) | `fingrid_grid_snapshot`, `fingrid_cheap_hours`, `fingrid_co2_intensity`, `fingrid_series`, `fingrid_dataset`, `fingrid_licence_info` |
| **5** | [`tools/fmi-fingrid-nowcast`](./tools/fmi-fingrid-nowcast) | [`itulo/fmi-fingrid-nowcast`](https://apify.com/itulo/fmi-fingrid-nowcast) | FMI WFS 2.0 Weather Forecasts + Fingrid Wind/Solar/Load | Keyless (`weather_only`) or `FINGRID_API_KEY` | `fmi_fingrid_nowcast`, `fmi_station_weather`, `fmi_fingrid_licence_info` |
| **6** | [`tools/fmi-weather-warnings-alerts`](./tools/fmi-weather-warnings-alerts) | [`itulo/fmi-weather-warnings-alerts`](https://apify.com/itulo/fmi-weather-warnings-alerts) | FMI CAP 1.2 Severe Weather/Marine Alerts + WFS Observations & Mareographs | Yes | `fmi_active_alerts`, `fmi_weather_observations`, `fmi_sea_level_observations`, `fmi_alerts_licence_info` |
| **7** | [`tools/eu-vies-vat-validator`](./tools/eu-vies-vat-validator) | [`itulo/eu-vies-vat-validator`](https://apify.com/itulo/eu-vies-vat-validator) | European Commission VIES VAT REST API (`ec.europa.eu/taxation_customs/vies`) | Yes | `vies_validate_vat_batch`, `vies_member_state_status`, `vies_licence_info` |
| **8** | [`tools/ecb-fx-rates-macro`](./tools/ecb-fx-rates-macro) | [`itulo/ecb-fx-rates-macro`](https://apify.com/itulo/ecb-fx-rates-macro) | European Central Bank (ECB) SDMX 2.1 Data Portal (`data-api.ecb.europa.eu`) | Yes | `ecb_fx_rates`, `ecb_policy_rates_and_inflation`, `ecb_convert_invoices`, `ecb_licence_info` |
| **9** | [`tools/digitraffic-port-calls-marine`](./tools/digitraffic-port-calls-marine) | [`itulo/digitraffic-port-calls-marine`](https://apify.com/itulo/digitraffic-port-calls-marine) | Fintraffic Digitraffic Marine Port Call API (`meri.digitraffic.fi`) | Yes | `digitraffic_port_calls`, `digitraffic_port_congestion_summary`, `digitraffic_licence_info` |
| **10** | [`tools/enisa-euvd-vulnerabilities`](./tools/enisa-euvd-vulnerabilities) | [`itulo/enisa-euvd-vulnerabilities`](https://apify.com/itulo/enisa-euvd-vulnerabilities) | EU Agency for Cybersecurity (ENISA) European Vulnerability Database (`euvd.enisa.europa.eu`) | Yes | `euvd_exploited_and_critical`, `euvd_search_vulnerabilities`, `euvd_lookup_by_id`, `euvd_licence_info` |

---

## Quickstart 1: Zero-Install Hosted MCP in Claude Desktop & Cursor (`@apify/actors-mcp-server`)

Add any combination of the 10 tools to your `claude_desktop_config.json` or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "eu-nordic-open-data": {
      "command": "npx",
      "args": [
        "-y",
        "@apify/actors-mcp-server",
        "--actors",
        "itulo/ted-tender-feed,itulo/prh-company-events,itulo/eu-sanctions-screen,itulo/fingrid-grid-signals,itulo/fmi-fingrid-nowcast,itulo/fmi-weather-warnings-alerts,itulo/eu-vies-vat-validator,itulo/ecb-fx-rates-macro,itulo/digitraffic-port-calls-marine,itulo/enisa-euvd-vulnerabilities"
      ],
      "env": {
        "APIFY_TOKEN": "YOUR_APIFY_API_TOKEN"
      }
    }
  }
}
```

---

## Examples: n8n workflows and LangChain / LangGraph

[`examples/`](./examples) contains importable **n8n** workflows (daily EU tender alert by CPV code to email or Slack, Finnish company events to Google Sheets, sanctions screening of a name list) and **LangChain / LangGraph** examples (MCP adapter agent over `src/index.js`, plus `ApifyActorsTool` with the hosted actor). See [`examples/README.md`](./examples/README.md).

---

## Quickstart 2: Run Locally as Stdio MCP Servers

Clone the repository, install dependencies in any tool folder, and connect directly over stdio:

```bash
git clone https://github.com/itulo/eu-nordic-open-data-mcp.git
cd eu-nordic-open-data-mcp/tools/ted-tender-feed
npm install
npm test          # Offline deterministic fixture unit tests (63/63 across all 10 tools)
npm run smoke     # Live upstream API verification
npm run mcp       # Start stdio MCP server
```

Example local `claude_desktop_config.json` / `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ted-tender-feed": {
      "command": "node",
      "args": ["/absolute/path/to/eu-nordic-open-data-mcp/tools/ted-tender-feed/src/mcp-server.js"]
    },
    "eu-sanctions-screen": {
      "command": "node",
      "args": ["/absolute/path/to/eu-nordic-open-data-mcp/tools/eu-sanctions-screen/src/mcp-server.js"]
    },
    "eu-vies-vat-validator": {
      "command": "node",
      "args": ["/absolute/path/to/eu-nordic-open-data-mcp/tools/eu-vies-vat-validator/src/mcp-server.js"]
    },
    "ecb-fx-rates-macro": {
      "command": "node",
      "args": ["/absolute/path/to/eu-nordic-open-data-mcp/tools/ecb-fx-rates-macro/src/mcp-server.js"]
    },
    "enisa-euvd-vulnerabilities": {
      "command": "node",
      "args": ["/absolute/path/to/eu-nordic-open-data-mcp/tools/enisa-euvd-vulnerabilities/src/mcp-server.js"]
    }
  }
}
```

---

## Quickstart 3: n8n, Make.com & Sync REST API (`run-sync-get-dataset-items`)

Every actor can be called synchronously as a JSON REST endpoint:

```bash
curl -s -X POST \
  "https://api.apify.com/v2/acts/itulo~ted-tender-feed/run-sync-get-dataset-items?token=${APIFY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"cpvCodes":["72000000"],"countries":["FIN","SWE"],"maxResults":5}'
```

---

## Licence & Attribution Register

- **Code Licence:** [MIT License](./LICENSE)
- **Data Licences & Mandatory Attribution:** Documented with primary legal sources in [`LICENCE_REGISTER.md`](./LICENCE_REGISTER.md) and [`licences.json`](./licences.json) (European Commission Decision 2011/833/EU, CC BY 4.0, ECB Reuse Policy, and ENISA Legal Notice).
