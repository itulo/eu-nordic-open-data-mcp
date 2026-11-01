# UK Companies House KYB Lookup + GLEIF LEI & Ownership — official APIs, company-level (`itulo/uk-companies-house-kyb`)

Look up and search **UK companies** on the official **Companies House Public Data API** with **your own free API key**. Built for KYB, onboarding and supplier checks: status, type, SIC codes, registered office, accounts and confirmation-statement deadlines, previous names, and optionally filing history, charges and insolvency. **No officer or PSC (beneficial owner) names** — company-level data only. No scraping.

## GLEIF LEI modes (no key, any country)
- **gleif_lookup** — `leis`: full LEI records (legal name, legal form, jurisdiction, register number, legal/HQ address, registration status and renewal date, managing LOU).
- **gleif_ownership** — `leis`: the entity plus its **direct and ultimate accounting parent** from GLEIF Level 2 relationship records (or the reporting exception, e.g. "natural persons" or "non-consolidating"), each parent resolved to its LEI record, plus the number of direct children.
- **gleif_search** — `gleifName` and/or `gleifRegisteredAs` (national register number), optional `gleifCountry`, `gleifStatus`.
- No key in **lookup** mode? The actor looks the UK company numbers up in GLEIF instead and tells you so in the run status (only companies with an LEI are returned).

Data: GLEIF LEI data, CC0 1.0 (`api.gleif.org`), ≤ 1 request/1.1 s. Sole-proprietor (natural person) LEI records are withheld; BIC/ISIN/other mapping fields are not output. Not endorsed by GLEIF.

```json
{ "mode": "gleif_ownership", "leis": ["549300FI8QIVYMUMBB43"] }
```

## You need a free Companies House API key (Companies House modes)
1. Register at <https://developer.company-information.service.gov.uk/> and create an application.
2. Create a **REST** API key (live environment).
3. Paste it into the `apiKey` input (stored as an Apify secret, never logged or written to the dataset).

Companies House allows 600 requests per 5 minutes per key; the actor stays below that (≈ 1.8 req/s).

## Modes
- **lookup** — `companyNumbers` (8 characters, e.g. `00445790`, `SC123456`; short numbers are zero-padded).
- **search** — free-text company-name search.
- **advanced_search** — filters: name, status, company type, SIC codes, incorporation date range, registered-office location.
- Enrichment (lookup mode): `filingHistoryItems` (latest N filings), `includeCharges`, `includeInsolvency`.

```json
{ "apiKey": "YOUR_KEY", "mode": "lookup", "companyNumbers": ["00445790", "00102498"], "filingHistoryItems": 5, "includeCharges": true }
{ "apiKey": "YOUR_KEY", "mode": "advanced_search", "sicCodes": ["62012"], "companyStatus": ["active"], "incorporatedFrom": "2026-01-01" }
```

## Output (per company)
Company number, name, status (+ detail), type, jurisdiction, incorporation/cessation dates, SIC codes, registered office (company address; `care_of` dropped), accounts (reference date, last made up to, next due, overdue), confirmation statement (next due, overdue), previous names, flags (charges, insolvency history, liquidated, register of members…), links, and, if requested, filings (date, category, type, description code — no officer names), charges (status, dates, classification, secured details summary, count of persons entitled only) and insolvency cases (type and dates; practitioner names dropped). Every record carries the Open Government Licence v3.0 attribution.

## Personal-data filtering
Officer and PSC endpoints are never called. Filing descriptions are reduced to a whitelist of non-personal fields (`officer_name` etc. dropped), charge holders are reduced to a count, insolvency practitioners are removed, and `care_of` is dropped from addresses. The registered office is the company's statutory address.

## Pricing (pay per event)
- Apify's standard start fee (`apify-actor-start`, $0.00005 per run)
- `company-profile`: **$0.0025** per Companies House company record
- `company-event`: **$0.001** per filing, charge or insolvency item returned
- `lei-record`: **$0.002** per GLEIF LEI record (also charged in the keyless company-number fallback)
- `ownership-chain`: **$0.003** per entity with direct + ultimate parent resolved

## Licence
Contains public sector information licensed under the **Open Government Licence v3.0** (Companies House). GLEIF LEI data is CC0 1.0. Not affiliated with or endorsed by Companies House or GLEIF.
