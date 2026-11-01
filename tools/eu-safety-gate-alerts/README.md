# EU Safety Gate Dangerous Product Alerts & GTIN Recall Check (`itulo/eu-safety-gate-alerts`)

Official **Safety Gate** (ex-RAPEX) alerts on dangerous non-food products, straight from the European Commission's weekly-report XML (published every Friday, **CC0 1.0**). No key, no scraping of web pages.

## What you get
- **alerts mode** — every alert in the latest N weekly reports: case number, alert link, report date, category, product, brand, name, model, batch, **GTIN/EAN barcodes**, risk type and level, danger description, measures taken (recall, withdrawal, import rejection…), notifying country, country of origin, marketplace platform names and listing ids (e.g. ASINs), photo links.
  Filter by notifying country, origin, category, risk type, risk level, free text or report date.
- **Monitor (`onlyNew: true`)** — schedule it weekly and get only alerts you have not seen before.
- **match mode** — screen your catalogue (`gtin`, `listingId`, `brand` + `model`, or `brand` + `name`) against the last 1–52 weeks. One record per product checked: `matched`, `matchCount`, `bestMatchType` (gtin › listing_id › brand_model › brand_name › brand_only) and the matching alerts. Useful for GPSR due diligence, marketplace compliance and recall checks.

```json
{ "mode": "alerts", "weeks": 4, "category": "Toys", "riskLevel": "Serious" }
```
```json
{ "mode": "match", "weeks": 12, "products": [{ "gtin": "5901234123457" }, { "brand": "Example", "model": "X-100" }] }
```

## Pricing (pay per event)
- `actor-start`: **$0.01** per run
- `alert-record`: **$0.0015** per alert written ($1.50 per 1,000)
- `product-match`: **$0.0005** per catalogue product checked ($0.50 per 1,000)

A typical weekly report has a few dozen to a few hundred alerts.

## Data, licence and personal data
- Source: European Commission, Safety Gate weekly reports (`ec.europa.eu/safety-gate-alerts`), CC0 1.0 (data.europa.eu distribution). © European Union. Every record carries the attribution.
- **Product-level only.** Seller free text is reduced to platform names and listing ids; photos are linked, not re-hosted.
- Requests are spaced ≥ 1 s; published weekly reports are cached in memory.
- Informational only, not legal advice. Brand/model matches can be false positives — always check the official alert. Not affiliated with or endorsed by the European Commission.
