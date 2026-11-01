# France Company Search — Insee Sirene via API Recherche d'entreprises (`itulo/france-sirene-company-search`)

Search and look up **French companies** in the official Insee **Sirene** base through the French government's free API *Recherche d'entreprises* (`recherche-entreprises.api.gouv.fr`, DINUM). No API key, no scraping. **Company-level fields only:** no sole traders, no directors, no home addresses. Every record carries the Licence Ouverte 2.0 attribution.

## What you get per company
SIREN, name and acronym, legal form (code + label), NAF/APE activity (NAF rév. 2 and NAF 2025) and section, company category (PME/ETI/GE), headcount band, active/closed status, creation and closure dates, establishment counts, head office (SIRET, postcode, commune, département, région, employer flag; **no street address**), computed intra-EU VAT number (`FR` + key + SIREN), collective agreements (IDCC), labels (ESS, société à mission, Qualiopi…), Insee diffusion status, the RNE marketing opt-out flag (`marketingOptOut`), update timestamps and a link to annuaire-entreprises.data.gouv.fr.

## Modes
- **search** — free-text `query` (name, SIREN, address words) and/or filters: `nafCodes`, `section`, `postCodes`, `communeCodes`, `departements`, `regions`, `legalForms`, `companyCategory`, `headcountBands`, `status`, `ess`, `societeMission`. Up to 10,000 results per query (API limit). Location filters match any establishment of the company, not only the head office.
- **lookup** — list of SIREN (9 digits) or SIRET (14 digits) numbers; invalid checksums are rejected before calling the API.

```json
{ "mode": "search", "query": "airbus", "maxResults": 20 }
{ "mode": "search", "nafCodes": ["62.01Z"], "departements": ["31"], "companyCategory": "PME", "maxResults": 200 }
{ "mode": "lookup", "sirenNumbers": ["383474814", "552032534"] }
```

## Sample record (abridged)
```json
{ "siren": "383474814", "name": "AIRBUS", "legalForm": { "code": "5710", "label": "SAS (société par actions simplifiée)" },
  "activity": { "naf": "30.30Z", "naf2025": "30.31Y", "section": "C" }, "companyCategory": "GE", "headcountLabel": "10,000+",
  "status": "active", "creationDate": "1991-10-18",
  "headOffice": { "siret": "38347481400100", "postCode": "31700", "city": "BLAGNAC", "departement": "31", "region": "76" },
  "vatNumberComputed": "FR89383474814", "diffusionStatus": "O", "marketingOptOut": true, "marketingOptOutSource": "rne",
  "attribution": "Source : Insee, base Sirene des entreprises et de leurs établissements (via API Recherche d'entreprises, DINUM), Licence Ouverte 2.0, ..." }
```

## Personal-data filtering (company level only)
- **Sole traders / individual entrepreneurs (EI, legal form 1xxx, `est_entrepreneur_individuel`) are excluded** at query time and again client-side; groupings without legal personality (2xxx) are dropped too.
- **Insee diffusion status is always respected.** Units in partial diffusion (`statut_diffusion` / `statut_diffusion_etablissement` = `"P"`, i.e. they filed an opposition with Insee) are output only with the fields Insee keeps public: for legal persons Insee masks the exact address and geolocation (everything but the commune), so `headOffice.postCode` is withheld, any `[ND]` value is dropped, and `partialDiffusionMasked` lists what was withheld. `diffusionStatus` is on every record. Any other status is dropped.
- Director / officer names (`dirigeants`) and elected officials are never requested or output; no street addresses or coordinates.

## Marketing opt-out (GDPR art. 21(2), Code de commerce R.123-320)
- `marketingOptOut` comes from the official API field **`opposition_diffusion_commerciale`** (source: RNE, the national companies register): `true` = the company objected to reuse of its data for commercial prospecting. When the unit is not in the RNE the API returns `null`; we report `marketingOptOut: false` with `marketingOptOutSource: "not_in_rne"`.
- **`excludeMarketingOptOut` is ON by default:** these companies are dropped (counted in the run summary under `excluded.marketing_opt_out`) — the safe default for lead lists.
- **If you turn it OFF**, records with `marketingOptOut: true` may only be used for **non-marketing purposes such as KYB, compliance and credit checks — never for prospecting** (no cold email, calls, mailing or ad audiences). **You are the data controller** for your use of the data and are responsible for honouring the opposition.
- Note: many large companies (e.g. Airbus SAS) have filed this opposition, so a default `airbus` search omits them.

## Pricing (pay per event)
- Apify's standard start fee (`apify-actor-start`, $0.00005 per run, covers the first 5 s of compute)
- `company-result`: **$0.0025** per company record ($2.50 per 1,000)

## Licence
Data © Insee, base Sirene, via API Recherche d'entreprises (DINUM), under **Licence Ouverte / Open Licence 2.0** (Etalab). Attribution and the data update date are included in every record. Rate-limited to ≤ 2 requests/s (the API allows 7/s). Not affiliated with Insee, DINUM or the French government.
