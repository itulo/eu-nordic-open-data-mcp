# Changelog

## [0.2.1] - 2026-11-09

### Fixed
- `eu-sanctions-screen`: every EU FSF download is now validated (no HTML/maintenance pages, expected CSV header, plausible entity count) before use or caching; cookie-keeping redirect handling with bounded retries; the sorry.ec.europa.eu maintenance redirect is never parsed.
- `eu-sanctions-screen`: persistent last-good cache (gzipped CSV + fetchedAt, fileGenerationDate, entity count, sha256). When the official download is unavailable, responses use the cached copy and carry `listStatus: "stale"`, `listFetchedAt`, `listAgeHours`, `upstreamError` and a `staleWarning`; with no cache the tool fails with a clear error.

## [0.2.0] - 2026-11-01

### Added
- `gleif-lei-lookup`: GLEIF LEI lookup, name/registration-number search and ownership chain (direct and ultimate parent via Level 2 relationship records, reporting exceptions, direct-children count). CC0 1.0. Sole-proprietor LEI records withheld.
- `eu-vat-rates`: EU VAT rates per Member State from the European Commission TEDB web service (standard, reduced, super-reduced, parking, regional rates; CN/CPA/category lookups). CC BY 4.0, not legally binding.
- `eu-safety-gate-alerts`: EU Safety Gate dangerous-product alerts from the weekly XML reports, filtering and catalogue matching by GTIN, listing ID, brand/model. CC0 1.0. No seller identities.
- `prh-company-events`: Norway mode (Brreg Enhetsregisteret, NLOD 2.0) with new MCP tools `brreg_company_events` and `brreg_company_lookup`; sole proprietorships (ENK) excluded. Finnish default unchanged.
- Root `npm test` runs every tool's offline fixture tests.

### Changed
- Shared library and actor sources synced with the deployed Apify builds (retry/Retry-After handling, charge helpers).
- Licence register and `licences.json` extended with Companies House, Sirene, GLEIF, EU TEDB, Safety Gate and Brreg entries.

## [0.1.0] - 2026-10-27

### Added
- Unified root MCP server (`src/index.js`), `Dockerfile`, `package.json`, and `server.json` exposing all 34 tools across the 10 EU & Nordic official open-data servers.
- Individual stdio MCP servers and Apify Actors under `tools/*`:
  - `ted-tender-feed` (TED EU Public Procurement Tenders)
  - `prh-company-events` (Finnish PRH Company Register Events)
  - `eu-sanctions-screen` (EU Consolidated Financial Sanctions Screening)
  - `fingrid-grid-signals` (Fingrid Finnish Power Grid & Reserve Signals)
  - `fmi-fingrid-nowcast` (FMI Weather + Fingrid Wind/Solar Generation Nowcast)
  - `fmi-weather-warnings-alerts` (FMI Weather Warnings, Lightning & Baltic Sea Level)
  - `eu-vies-vat-validator` (EU VIES Cross-Border VAT Number Validator)
  - `ecb-fx-rates-macro` (ECB Euro Reference FX Rates, Policy Rates & HICP Inflation)
  - `digitraffic-port-calls-marine` (Fintraffic Digitraffic Vessel Port Calls & Congestion)
  - `enisa-euvd-vulnerabilities` (ENISA European Vulnerability Database EUVD CVEs)
