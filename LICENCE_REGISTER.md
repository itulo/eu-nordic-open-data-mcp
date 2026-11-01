# Licence register: Open-Data Tool Factory

Verified on 11 Oct 2026, around 15:30–15:55 EEST (Helsinki), against official pages fetched live. The machine-readable version is `licences.json`, which every tool copies into `src/licences.json` and reads its attribution strings from.

Labels:
- **[unverified]**: could not be confirmed on an official page.
- **exact**: the source's own wording.
- **proposed**: our wording, written to meet a general "cite the source" requirement.

Saved copies of the official evidence are in `_evidence/`:
- ENTSO-E list and terms of use (PDF and text)
- Commission Decision 2011/833 (HTML)
- PRH OpenAPI specifications
- Fingrid API operations and OpenAPI export

## Summary

| Source | Status | Licence | Key? | Rate limits |
|---|---|---|---|---|
| Fingrid | ✅ allowed | CC BY 4.0 (Fingrid-produced datasets) | **yes** (free) | 10,000 req/24 h; 1 req/2 s per key |
| FMI | ✅ allowed | CC BY 4.0 | no | 20,000/day download; 10,000/day view; 600 per 5 min combined |
| PRH/YTJ | ✅ allowed, **company-level only** | CC BY 4.0 | no | no number published [unverified]; HTTP 429 exists |
| TED | ✅ allowed | Commission reuse policy (Dec. 2011/833/EU); CC BY 4.0 for editorial content; CC0 metadata | no (search) | 700 req/min; 600 notice views per 6 min per IP; 3 concurrent bulk downloads |
| ENTSO-E | ⚠️ partial | CC BY 4.0 **only** for the "List of Data Available for Free Re-use"; everything else falls under the Terms of Use and may need the Primary Owner's consent | yes (token) | 400/min [unverified, third-party] |
| EU sanctions list (FSF) | ✅ allowed with conditions | Commission reuse notice (Dec. 2011/833/EU); one distribution is also tagged CC BY 4.0 on data.europa.eu | no | none published [unverified] |
| **Nord Pool** | ⛔ **EXCLUDED** | proprietary, paid licence | n/a | n/a |

---

## Fingrid (data.fingrid.fi)
- **Licence:** CC BY 4.0, covering datasets produced by Fingrid. Datasets produced by other organisations can carry other licences, so check each dataset's `license` field. Our tool rejects any dataset that is not Fingrid-produced and CC BY.
  - Licence: https://creativecommons.org/licenses/by/4.0/
  - Terms: https://data.fingrid.fi/en/about
- **Exact attribution:** `Source Fingrid / data.fingrid.fi, license CC 4.0 BY`
- **Attribution rules:**
  - Keep the copyright notice and the disclaimers.
  - Link to the original material where technically possible.
  - If the material is modified, add a notice describing the change, with a link.
  - Name CC BY 4.0 and link to the licence.
  - Fingrid may ask for the attribution to be removed.
- **API key:** required. It is free: register, then subscribe to "Open Data starter" in the developer portal. The key goes in the `x-api-key` header, never in the URL.
- **Rate limits:** 10,000 requests per 24 h and **one request every two seconds** per key. Repeatedly exceeding them can lead to restricted access or account closure. Source: https://data.fingrid.fi/en/instructions.
- **Restrictions:**
  - Our policy: no Fingrid logo and no look-alike UI. (Fingrid's separate "Legal terms" page was not checked for a logo clause [unverified].)
  - Whether one key may serve many end users through a shared MCP service [unverified]. Plan for users to bring their own key, or ask Fingrid.

## FMI (Ilmatieteen laitos)
- **Licence:** CC BY 4.0. Covers FMI and STUK datasets and the listed air-quality datasets (annex 1 names the air-quality licensors).
  - Licence: https://creativecommons.org/licenses/by/4.0/deed.fi
  - Terms: https://www.ilmatieteenlaitos.fi/avoin-data-lisenssi
- **Attribution (exact pattern):** licensor name plus dataset name, e.g. `Ilmatieteen laitoksen avoin data, meriveden korkeushavainnot`. In English: "Finnish Meteorological Institute open data, <dataset>".
- **API key:** none mentioned. Users must accept the CC licence.
- **Rate limits:** download service 20,000 queries/day; view service 10,000/day; at most 600 queries per 5 minutes across both.
- **Restrictions:** the FMI open-data logo may be used with the data, but the **FMI logo itself must not be used** in open-data products. (Not used by the first three tools.)

## PRH / YTJ (avoindata.prh.fi)
- **Licence:** CC BY 4.0. Source: https://avoindata.prh.fi/fi/info/swagger-ui. The OpenAPI specs also name CC BY 4.0.
- **Attribution:** PRH only says "Mainitse alkuperäinen lähde" (cite the original source); it gives **no exact string**. Proposed: `Source: Finnish Patent and Registration Office (PRH), open data avoindata.prh.fi (YTJ / Trade Register), licence CC BY 4.0`
- **API key:** none. Data is updated once a day.
- **Rate limits:** no number published [unverified]. The API documents HTTP 429. Our client sends at most 1 request per second and backs off.
- **Restrictions (verified):**
  - Do **not** use the PRH or YTJ logo.
  - Do **not** make a service that could be confused with PRH services by its appearance.
  - The API excludes sole traders (toiminimi) and company e-mails and phones.
- **GDPR:** register data can identify persons, e.g. board members, `c/o <name>` in addresses (seen in live data), and representatives in notices. Our tool outputs **company-level fields only**: it drops c/o, street, building, apartment and PO box, and removes person-related entry codes.

## TED (Publications Office of the EU)
- **Licence:** the Commission reuse policy (Decision 2011/833/EU): "procurement notices … can be freely reused, for commercial or non-commercial purposes". Editorial content of the TED websites is CC BY 4.0; metadata is CC0. Source: https://ted.europa.eu/en/legal-notice.
- **Attribution:** no exact string given. CC BY requires credit plus an indication of changes. Proposed: `Source: TED - Tenders Electronic Daily (ted.europa.eu), © European Union, 1998-2026. Reused under the European Commission reuse policy (Decision 2011/833/EU); changes: fields selected, normalised and deduplicated.`
- **API key:** not needed for the Search API (anonymous). Keys are only for publication and validation endpoints. Source: https://docs.ted.europa.eu/api/latest/index.html.
- **Rate limits (fair usage):**
  - 700 HTTP requests per minute
  - 600 notice views or downloads per 6 minutes per IP
  - 3 concurrent bulk-package downloads

  Source: https://ted.europa.eu/en/simap/developers-corner-for-reusers.
- **Restrictions:**
  - **Third-party rights:** content not owned by the EU, or content depicting identifiable private individuals, may need separate clearance.
  - Logos and trademarks are excluded from the reuse policy, and the **TED/SIMAP logo needs the Publications Office's prior consent**.
  - Only e-signed OJ S notices are authentic.
  - **Personal data in notices:** contact persons, e-mails, phones, jury members and natural-person tenderers. The tool requests none of these fields.

## ENTSO-E Transparency Platform
- **Licence:** Terms of Use (version approved 29 Mar 2023, applicable from 1 Nov 2023), clause 2.5: "ENTSO-E currently publishes a subset of the Transparency Platform data available under an open source license (CC-BY 4.0)".
  - Clause 3.1 requires naming the ENTSO-E Transparency Platform as the source, forbids implying ENTSO-E sponsorship or endorsement, and says not to prejudice the Primary Owner's copyright.
  - Data off the list may need the Primary Owner's prior agreement, and users must check the list before each reuse.
  - ToU PDF: https://transparencyplatform.zendesk.com/hc/article_attachments/40921869376401; version history: https://transparencyplatform.zendesk.com/hc/en-us/articles/40921911218961-Legal-Terms-and-Conditions
- **Attribution (proposed):** `Source: ENTSO-E Transparency Platform (transparency.entsoe.eu), licence CC BY 4.0; changes made: <describe>`
- **API key:** yes, a security token tied to a Transparency Platform account [process details unverified].
- **Rate limit:** 400 requests per minute per token [unverified; third-party source only].
- **Are day-ahead prices on the free-reuse list? NO.**
  - The official list (version of 28 Oct 2019, ENTSO-E CDN) covers:
    - load forecasts (6.1.b–e)
    - grid and interconnector changes and unavailability (9.1, 10.1.a–b)
    - capacities (11.1, 11.4)
    - explicit allocations (12.1.a–c)
    - scheduled exchanges, physical flows and allocated cross-zonal capacity (12.1.f–h)
    - redispatching and countertrading (13.1.a–c)
    - balancing (17.1.a–j), including **imbalance prices (17.1.g)** and volumes
  - It does **not** include **12.1.d day-ahead prices**.
  - ENTSO-E's official version history records no later addition of 12.1.d:
    - 2020: balancing and SO-guideline items added
    - 2022: CC BY 4.0 added, plus a Georgia exception
    - 2023: Georgia removed from the exceptions
  - The 18 Oct 2023 PDF itself could not be downloaded (403), so final confirmation is [unverified]. Two independent reuser summaries also say day-ahead prices are not on the list.
  - **Consequence:** day-ahead prices from ENTSO-E belong to the NEMOs (e.g. Nord Pool). Treat them as **EXCLUDED**, like Nord Pool directly.
- **List exceptions (2019 text):** Moldova, Turkey, IFA (FR–GB) and Nemo Link (BE–GB) interconnector data. Later versions changed the Georgia and BritNed status.

## EU consolidated financial sanctions list (DG FISMA, Financial Sanctions Files)
- **Licence:** the "European Commission reuse notice", i.e. Commission Decision 2011/833/EU. Every FSF distribution in the data.europa.eu catalogue (XML 1.0/1.1, CSV 1.1, PDF, RSS) carries it, and one CSV 1.0 distribution is tagged CC BY 4.0.
  - Decision text: https://eur-lex.europa.eu/eli/dec/2011/833/oj
  - Catalogue record: https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions
- **What the reuse terms say (verified in the Decision text):**
  - Art. 4: reuse is allowed for **commercial or non-commercial purposes**, **without charge**, and **without an individual application**.
  - Art. 4: the Decision is to be applied "in full respect of the rules on the protection of individuals with regard to the processing of personal data".
  - Art. 6(2): conditions may be **(a) acknowledging the source, (b) not distorting the original meaning or message, (c) no liability for the Commission**.
- **Attribution (proposed):** `Source: European Commission, Consolidated list of persons, groups and entities subject to EU financial sanctions (Financial Sanctions Files), file generated <fileGenerationDate>. Reused under Commission Decision 2011/833/EU. Not legal advice; check the official list and the Official Journal.`
- **API key:** none. Public file URLs with a public token download without login (tested: CSV 1.1 is about 25 MB, HTTP 200). The FSF web UI now redirects to EU Login.
- **Rate limits:** none published [unverified]. The list is updated daily, so one download per day is enough.
- **Restrictions:**
  - The list **contains personal data of sanctioned natural persons**, so GDPR applies to our processing. This means a lawful basis (helping with screening obligations), accuracy (always show the file date), and no enrichment or profiling.
  - Fuzzy matches must be labelled "possible match", not "determination", so as not to distort meaning.
  - Every response needs a "not legal advice" disclaimer and the list date.
  - EU emblem and logos are not licensed.
- **Plan impact:** a sanctions-screening MCP is licence-feasible. It needs a privacy notice and a short legitimate-interest note before launch.

## Nord Pool: EXCLUDED
A paid licence is needed for public display or redistribution of its prices. Source: https://www.nordpoolgroup.com/49fb8e/globalassets/download-center/power-data-services/general-terms-data-services-data.pdf. The fee estimate in ROUND4 is about €3,500–5,500 per year, not re-checked this round.
- No tool may ingest, display or redistribute Nord Pool or other NEMO day-ahead prices.
- This includes the same prices obtained through ENTSO-E (12.1.d).
- The Fingrid tool's test suite includes a guard against this.

---

## Batch 2 Additions (Verified 27 Oct 2026, ~16:00 EET / UTC+2)

Saved evidence files added in `_evidence/`:
- `fmi_licence.html`, `fmi_open_data_en.html`, `fmi_cap_alerts_sample.xml`
- `ec_legal_notice.html`, `vies_i18n_en.json`, `vies_check_status_sample.json`
- `ecb_stats_reuse.html`, `ecb_disclaimer.html`, `ecb_exr_sample.json`
- `digitraffic_terms_en.html`, `digitraffic_terms_fi.html`, `digitraffic_port_calls_sample.json`
- `enisa_legal_notice.html`, `euvd_apidoc.html`, `euvd_apidoc_extracted.txt`, `enisa_euvd_sample.json`

| Source | Status | Licence | Key? | Rate limits |
|---|---|---|---|---|
| EU VIES (`eu_vies`) | ✅ allowed (**company-level only**) | Commission Decision 2011/833/EU & VIES Specific Disclaimer | no | Sequential throttling (respects `MS_MAX_CONCURRENT_REQ`) |
| ECB Statistics (`ecb`) | ✅ allowed | Policy regarding the reuse of ESCB statistics | no | Fair use on `data-api.ecb.europa.eu` |
| Fintraffic Digitraffic (`digitraffic`) | ✅ allowed | CC BY 4.0 | no | Fair use; send `Digitraffic-User` & `Accept-Encoding: gzip` |
| ENISA EUVD (`enisa_euvd`) | ✅ allowed | ENISA Legal Notice (source acknowledgement) | no | Max 100 items per `/api/search` page |

### EU VIES (DG TAXUD — VAT Information Exchange System)
- **Licence:** Commission reuse policy (Decision 2011/833/EU) and VIES Specific Disclaimer (`https://commission.europa.eu/legal-notice_en`, `https://ec.europa.eu/taxation_customs/vies/`).
- **Attribution (proposed):** `Source: European Commission, VIES (VAT Information Exchange System, ec.europa.eu/taxation_customs/vies), retrieved from national EU Member State VAT databases. Reused under Commission Decision 2011/833/EU. Company-level data only; sole-trader personal names/addresses redacted.`
- **GDPR safeguard:** National VAT registers (such as FI, PL, IE) return natural-person names and residential street addresses when a VAT number belongs to a sole trader (`toiminimi` / natural person). Our tool (`eu-vies-vat-validator`) detects corporate legal forms (`Oy`, `Ab`, `GmbH`, `Ltd`, `AS`, `S.A.`, `B.V.`, `S.r.l.`, `Sp. z o.o.`, etc.) vs. natural persons/sole traders and redacts personal names and residential street addresses whenever a non-corporate entity is detected.

### European Central Bank (ECB Statistics / SDMX 2.1 Data Portal)
- **Licence:** Policy regarding the reuse of ESCB statistics (`https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html`): "All publicly available ESCB statistics may be reused free of charge on the condition that the source is quoted (e.g. 'Source: ECB statistics.') and that the statistics (including metadata) are not modified."
- **Attribution (exact-pattern):** `Source: ECB statistics (European Central Bank SDMX 2.1 Data Portal, data.ecb.europa.eu). Reused under the Policy regarding the reuse of ESCB statistics; reference rates are published for information purposes only.`
- **Modification / derived calculations:** Official rates are returned unmodified; invoice conversion helper outputs explicitly label converted amounts as derived calculations based on official ECB reference rates.

### Fintraffic Digitraffic (`meri.digitraffic.fi`, `tie.digitraffic.fi`, `rata.digitraffic.fi`)
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0) (`https://www.digitraffic.fi/en/terms-of-service/`).
- **Exact attribution:** `Source: Fintraffic / digitraffic.fi, license CC 4.0 BY`
- **Technical requirements:** Always include `Digitraffic-User` header and `Accept-Encoding: gzip`.

### EU ENISA European Vulnerability Database (EUVD — `euvd.enisa.europa.eu`)
- **Licence:** ENISA Legal Notice (`https://www.enisa.europa.eu/about-enisa/legal-notice/legal-notice`, Section 1.2): "Reproduction of ENISA material published on this website is authorized, provided the source is acknowledged, unless it is stated otherwise."
- **Attribution (proposed):** `Source: European Union Agency for Cybersecurity (ENISA) — European Vulnerability Database (EUVD, euvd.enisa.europa.eu), © European Union Agency for Cybersecurity. Reused with source acknowledgement under the ENISA Legal Notice.`

---

## Batch 3 additions (verified Sun 1 Nov 2026, about 10:40–11:00 EET / UTC+2)

Verified live with curl/WebFetch on 1 Nov 2026. Machine-readable entries: `licences.json` keys `companies_house`, `sirene`, `gleif`, `eu_tedb`, `safety_gate`, `brreg`. Raw copies: `/workspace/odf-work/lic/` and `/workspace/lic/`.

| Source | Status | Licence | Key? | Rate limits | Used by |
|---|---|---|---|---|---|
| Companies House (UK) | ✅ company-level only | Public register: "no rules or requirements on how the information … is used"; GOV.UK content OGL v3.0 | **yes**, user's own free key (secret input) | 600 req / 5 min per application | `uk-companies-house-kyb` actor (private) |
| Insee Sirene via API Recherche d'entreprises (FR) | ✅ legal entities only | Licence Ouverte 2.0 (data.gouv.fr `license: lov2`) | no ("Accès ouvert") | 7 req/s per IP, 30 req/s per ASN, 429 + Retry-After | `france-sirene-company-search` actor (private) |
| GLEIF LEI (global) | ✅ legal entities | CC0 1.0 | no | 60 req/min per user | MCP `gleif_*` tools |
| EU TEDB VAT rates | ✅ | CC BY 4.0 (Commission legal notice, Decision 2011/833/EU); data from Member States | no | none published [unverified] | MCP `eu_vat_rates*` tools |
| EU Safety Gate weekly reports | ✅ | CC0 1.0 (data.europa.eu XML/Excel weekly-report distributions) | no | none published [unverified] | MCP `eu_safety_gate_*` tools |
| Brreg Enhetsregisteret (NO) | ✅ legal entities only | NLOD 2.0 | no ("ikke nødvendig å registrere seg") | none published [unverified]; 10,000-result paging cap | `prh-company-events` actor, `registry: "no_brreg"` mode |

### Companies House (api.company-information.service.gov.uk)
- **Licence:** https://www.gov.uk/guidance/companies-house-data-products: "We impose no rules or requirements on how the information on the public register is used, and we're not responsible for your use of the company data. You are responsible for complying with any applicable data protection, copyright and other legislation and regulations." GOV.UK text: Open Government Licence v3.0.
- **Attribution (proposed, OGL standard statement):** `Contains public sector information licensed under the Open Government Licence v3.0. Source: Companies House public register (api.company-information.service.gov.uk); company-level fields only, officer/PSC names removed.`
- **Key:** required (401 without one). The actor takes the **user's own** free key as a secret input. No shared key, no account created by us.
- **Rate limit:** 600 requests per 5 minutes (https://developer-specs.company-information.service.gov.uk/guides/rateLimiting). The actor spaces requests at >= 550 ms and honours 429.
- **Personal-data filter:** officers, PSC, disqualified officers, LLP members, insolvency practitioners never called/emitted; filing-history `description_values` whitelisted to dates/charge numbers; charge `persons_entitled` reduced to a count.

### Insee Sirene via API Recherche d'entreprises (recherche-entreprises.api.gouv.fr)
- **Licence:** Licence Ouverte 2.0. data.gouv.fr dataset "Base Sirene des entreprises et de leurs établissements (SIREN, SIRET)" has `license: lov2`. The API (dataservice `api-recherche-dentreprises`, DINUM) is `access_type: open`, no account; its own code is MIT.
- **Attribution (proposed, meets LO 2.0 "source + date of last update"):** `Source : Insee, base Sirene des entreprises et de leurs établissements (via API Recherche d'entreprises, DINUM), Licence Ouverte 2.0, date de mise à jour indiquée dans chaque enregistrement (sireneUpdatedAt).` Every record carries `sireneUpdatedAt`.
- **Rate limit:** 7 req/s per IP and 30 req/s per ASN (openapi.json). The actor runs at 2 req/s and honours `Retry-After`.
- **Personal-data filter:** drops `nature_juridique` 1xxx (entrepreneurs individuels) and `est_entrepreneur_individuel`; drops nature juridique 2xxx groupings and `statut_diffusion` ≠ `O`; flags (does not drop by default) `opposition_diffusion_commerciale = true` as `prospectingOptOut`; never outputs `dirigeants`, `finances` (INPI/RNE, separate terms), élus, or street-level addresses (commune/postcode/département only).

### GLEIF (api.gleif.org)
- **Licence:** https://www.gleif.org/en/meta/lei-data-terms-of-use: "The data available through the Access Service are provided under the CC0 licence". Do not imply GLEIF endorsement; no GLEIF trademark use.
- **Attribution (courtesy):** `Source: GLEIF LEI data (Global Legal Entity Identifier Foundation, api.gleif.org), CC0 1.0. Not endorsed by GLEIF.`
- **Rate limit:** "60 requests, per minute, per user" (GLEIF API docs on Postman). The tool spaces requests at 1.1 s.
- **Filter:** `entity.category = SOLE_PROPRIETOR` records are withheld (LEI and status only). BIC/MIC/ISIN/OpenCorporates/S&P mapping fields are not output (separate mapping terms, unverified).

### EU TEDB VAT rates (ec.europa.eu/taxation_customs/tedb/ws/)
- **Licence:** The DG TAXUD VAT-rates page (https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en) links TEDB and its footer links the Commission legal notice (https://commission.europa.eu/legal-notice_en): "content owned by the EU on this website is licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence … reuse is allowed, provided appropriate credit is given and changes are indicated." TEDB data is supplied by Member States.
- **Attribution (proposed):** `Source: European Commission, Taxes in Europe Database (TEDB), data provided by EU Member States, CC BY 4.0. Changes: SOAP response converted to JSON and filtered.`
- **Rate limit:** none published [unverified]; 12 h cache, ≤1 req/s.

### EU Safety Gate (ec.europa.eu/safety-gate-alerts)
- **Licence:** data.europa.eu dataset `rapex-rapid-alert-system-non-food`: distributions "4. Weekly Reports - XML format" and "5. Weekly Reports - Excel format" are **Creative Commons CC0 1.0 Universal** (other distributions, e.g. HTML search, are under the Commission reuse notice and are not used).
- **Attribution (courtesy):** `Source: Safety Gate - the EU rapid alert system for dangerous non-food products (ec.europa.eu/safety-gate-alerts), European Commission, weekly reports, CC0 1.0. © European Union.`
- **Notes:** no personal data (product, brand, risk, measures). Product photos are linked only, not re-hosted. Not legal advice.

### Brreg Enhetsregisteret (data.brreg.no)
- **Licence:** https://www.brreg.no/produkter-og-tjenester/apne-data/: "Datasettene følger Norsk lisens for åpne data (NLOD). Det er ikke nødvendig å registrere seg for å ta datasettet i bruk." The OpenAPI spec's licence field is NLOD 2.0 (https://data.norge.no/nlod/no/2.0).
- **Attribution (NLOD recommended wording):** `Inneholder data under Norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Brønnøysundregistrene.`
- **Personal-data filter:** drops `organisasjonsform = ENK` (sole proprietorships) including deleted ENKs; never calls `/roller`; addresses reduced to postcode/town/municipality number; `aktivitet` free text and e-mail/phone/mobile never output.
- **SIRENE prospecting opt-out:** RNE `opposition_diffusion_commerciale` (Code de commerce R.123-320) is common, including for large companies (e.g. AIRBUS SAS). Such units are kept but flagged `prospectingOptOut: true`, and input `excludeProspectingOptOuts` drops them. Records flagged `true` must not be used for commercial prospecting; the README and input help say so. **Owner decision requested:** change the default to "exclude" if preferred.
- **SIRENE groupings:** nature juridique 2xxx (groupings without legal personality, e.g. indivisions between natural persons) are dropped as well as 1xxx.
