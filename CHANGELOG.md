# Changelog

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
