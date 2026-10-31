# langchain-eu-nordic-open-data

LangChain tools for **official EU and Finnish open data**, backed by the hosted
[`itulo/*` Apify actors](https://apify.com/itulo) from
[eu-nordic-open-data-mcp](https://github.com/itulo/eu-nordic-open-data-mcp).
No Node.js, scraping or site search: every tool calls an official public API and every
record keeps the upstream licence and attribution fields.

| Tool | Data source | Apify actor |
|---|---|---|
| `ted_tender_search` | TED – Tenders Electronic Daily (Publications Office of the EU) | `itulo/ted-tender-feed` |
| `eu_sanctions_screen` | EU consolidated financial sanctions list (European Commission, DG FISMA) | `itulo/eu-sanctions-screen` |
| `eu_vies_vat_validate` | VIES VAT number validation (European Commission) | `itulo/eu-vies-vat-validator` |
| `ecb_fx_rates_macro` | ECB Data Portal: euro FX reference rates, key rates, HICP | `itulo/ecb-fx-rates-macro` |
| `prh_company_events` | Finnish Patent and Registration Office (PRH/YTJ) open data | `itulo/prh-company-events` |
| `fmi_weather_alerts` | Finnish Meteorological Institute warnings and observations | `itulo/fmi-weather-warnings-alerts` |
| `digitraffic_port_calls` | Fintraffic Digitraffic Marine port calls | `itulo/digitraffic-port-calls-marine` |
| `fingrid_grid_signals` | Fingrid Open Data (needs free `FINGRID_API_KEY`) | `itulo/fingrid-grid-signals` |
| `fmi_fingrid_nowcast` | FMI forecasts + Fingrid wind/solar/load | `itulo/fmi-fingrid-nowcast` |

## Install

```bash
pip install langchain-eu-nordic-open-data
export APIFY_TOKEN=...        # https://console.apify.com/settings/integrations
export FINGRID_API_KEY=...    # optional, free from https://data.fingrid.fi
```

The actors are **pay-per-event**; runs are billed to the Apify account of your token.

## Use

```python
from langchain_eu_nordic_open_data import TedTenderSearchTool, get_tools

ted = TedTenderSearchTool()
notices = ted.invoke({"cpvCodes": ["72000000"], "countries": ["FI"], "maxResults": 5})
for n in notices:
    print(n["publicationNumber"], n["title"][:80])
print(notices[0]["attribution"])   # keep the attribution when you display results
```

With an agent (any chat model integration):

```python
from langchain.agents import create_agent
from langchain_eu_nordic_open_data import get_tools

agent = create_agent(
    model="openai:gpt-4.1-mini",
    tools=get_tools(),   # Fingrid tool is added when FINGRID_API_KEY is set
    system_prompt="Use the tools for EU/Finnish official data and quote each result's attribution.",
)
agent.invoke({"messages": [{"role": "user", "content": "Open IT tenders from Estonian buyers this week?"}]})
```

Prefer MCP? The same data is available as a local stdio MCP server
(`npx eu-nordic-open-data-mcp`) usable with `langchain-mcp-adapters`; see the
[repo examples](https://github.com/itulo/eu-nordic-open-data-mcp/tree/main/examples/langchain).

## Data licences and attribution

Data comes from official publishers under their reuse terms (Commission Decision
2011/833/EU for TED, VIES and the sanctions list; ECB reuse policy; CC BY 4.0 for PRH, FMI,
Fingrid and Digitraffic). Each record includes the attribution text and licence URL; keep
them when you republish. Full register:
[LICENCE_REGISTER.md](https://github.com/itulo/eu-nordic-open-data-mcp/blob/main/LICENCE_REGISTER.md).

This package is independent and not affiliated with or endorsed by any of these publishers.
Sanctions screening results are an aid, not legal advice. No personal data is collected;
sole-trader personal data is filtered out by the actors. No Nord Pool or exchange price data.

## Development

```bash
pip install -e ".[test]" && pytest
python -m build && twine check dist/*
```

Licence: MIT.
