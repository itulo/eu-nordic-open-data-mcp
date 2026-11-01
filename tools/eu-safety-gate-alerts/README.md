# EU Safety Gate dangerous-product alerts (MCP)

MCP tools on the official **Safety Gate** (ex-RAPEX) weekly-report XML published every Friday by the European Commission. Licence: **CC0 1.0** (data.europa.eu XML/Excel weekly-report distributions). No key.

| Tool | What it does |
|---|---|
| `eu_safety_gate_alerts` | Alerts from the latest N weekly reports, filtered by notifying country, origin, category, risk type/level or text. |
| `eu_safety_gate_match` | Screen a catalogue: exact GTIN/EAN, marketplace listing id (ASIN…) and brand+model matching over the last N weeks. |
| `eu_safety_gate_reports` | Latest weekly reports. |
| `eu_safety_gate_licence_info` | Licence, attribution, disclaimer. |

**Personal data:** product-level only. Marketplace seller free text is reduced to platform names + listing ids. Photos are linked, not re-hosted.
Weekly list cached 6 h, published reports cached in memory; >= 1 s between requests.
**Attribution:** `Source: Safety Gate - the EU rapid alert system for dangerous non-food products (ec.europa.eu/safety-gate-alerts), European Commission, weekly reports, CC0 1.0. © European Union.`
Not legal advice. Tests: `npm test`.
