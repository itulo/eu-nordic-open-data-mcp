# GLEIF LEI lookup & ownership chain (MCP)

MCP tools on the official **GLEIF API** (api.gleif.org, **CC0 1.0**, no key):

| Tool | What it does |
|---|---|
| `gleif_lei_lookup` | 1-100 LEIs: legal name, legal form, jurisdiction, legal/HQ address, national register id, entity & registration status, renewal date, managing LOU. Validates ISO 17442 check digits. |
| `gleif_search` | Search by company name and/or national register number (Y-tunnus, SIREN, UK company number…), country and status filters. |
| `gleif_ownership_chain` | Level 2 "who owns whom": direct and ultimate accounting-consolidation parents (names, status, periods, corroboration), or the reporting exception (`NON_CONSOLIDATING`, `NATURAL_PERSONS`…), plus direct-children count. |
| `gleif_licence_info` | Licence, attribution, policy. |

**Personal data:** records with `entity.category = SOLE_PROPRIETOR` are withheld (LEI + status only). BIC/ISIN/MIC/OpenCorporates/S&P mapping fields are not output.
**Rate limit:** GLEIF allows 60 requests/min/user; the client spaces requests >= 1.1 s.
**Attribution** (in every response): `Source: GLEIF LEI data (Global Legal Entity Identifier Foundation, api.gleif.org), CC0 1.0. Not endorsed by GLEIF.`
Tests: `npm test` (offline fixtures).
