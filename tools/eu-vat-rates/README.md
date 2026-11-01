# EU VAT rates - European Commission TEDB (MCP)

MCP tools on the official **Taxes in Europe Database (TEDB)** VAT retrieval SOAP web service (ec.europa.eu/taxation_customs/tedb/ws/), no key. Licence: **CC BY 4.0** (European Commission legal notice); data supplied by Member States.

| Tool | What it does |
|---|---|
| `eu_vat_standard_rates` | Per member state on any date: standard, reduced, super-reduced and parking rates, regional standard rates, categories with reduced rates. |
| `eu_vat_rates_lookup` | Rate for goods/services by CN code, CPA code or TEDB category (FOODSTUFFS, ACCOMMODATION…), with standard-rate fallback. |
| `eu_vat_rates_licence_info` | Licence, attribution, disclaimer. |

Greece is `EL` (`GR` accepted), Northern Ireland `XI`. Responses cached 12 h; >= 1 s between requests. No personal data.
**Attribution:** `Source: European Commission, Taxes in Europe Database (TEDB), data provided by EU Member States, CC BY 4.0. Changes: SOAP response converted to JSON and filtered.`
TEDB is not legally binding - check national legislation. Tests: `npm test`.
