# Examples: n8n workflows and LangChain / LangGraph agents

Ready-to-use examples for the MCP server in this repo and the matching hosted Apify actors.
Every record these tools return carries an `attribution` (and `licence`) field. Keep it in whatever you forward (email, Slack, sheets, agent answers).

## n8n workflows (`examples/n8n/`)

Import with **Workflows → Import from file**. They use the verified Apify node ([`@apify/n8n-nodes-apify`](https://www.npmjs.com/package/@apify/n8n-nodes-apify)) and the public actors under [apify.com/itulo](https://apify.com/itulo). Actor runs are pay-per-event and billed to your own Apify account. No credentials are included in the files.

| File | What it does | Actor |
|---|---|---|
| [`eu-tender-alert-by-cpv-email-slack.json`](./n8n/eu-tender-alert-by-cpv-email-slack.json) | Every weekday at 07:00, fetches **new** TED contract notices for your CPV codes and buyer countries (`alertMode`), builds one digest and sends it by email (Slack node included, disabled by default). | [`itulo/ted-tender-feed`](https://apify.com/itulo/ted-tender-feed) |
| [`finnish-company-events-to-google-sheets.json`](./n8n/finnish-company-events-to-google-sheets.json) | Every morning, upserts yesterday's Finnish company registrations, name changes, liquidations, bankruptcies, restructurings and dissolutions (PRH open data, company-level only) into a Google Sheet, de-duplicated on `eventKey`. | [`itulo/prh-company-events`](https://apify.com/itulo/prh-company-events) |
| [`eu-sanctions-screen-google-sheets.json`](./n8n/eu-sanctions-screen-google-sheets.json) | Reads a `name` column from a Google Sheet, screens all names in one run against the EU consolidated financial sanctions list, and writes one row per candidate (with `needsReview`) to a results tab. | [`itulo/eu-sanctions-screen`](https://apify.com/itulo/eu-sanctions-screen) |

Tested on n8n 2.45.7 with `@apify/n8n-nodes-apify` 0.6.4. All three workflows ran end to end against the live actors, up to the final email, Slack or Google Sheets node, which needs your own credentials.

Setup notes:
1. Install the Apify node (**Settings → Community nodes**, or use the verified node on n8n Cloud) and add an **Apify API** credential with your token.
2. Open the Apify node and adjust the *Input JSON* (CPV codes, countries, event types, threshold).
3. Connect your SMTP, Slack or Google Sheets credentials.

Sanctions results are an informational aid, not legal advice. Check `possible_match` rows by hand against the Official Journal of the EU.

## LangChain / LangGraph (`examples/langchain/`)

```bash
npm install                                    # repo root, once (Node.js >= 20)
python -m venv .venv && . .venv/bin/activate
pip install -r examples/langchain/requirements.txt
```

| File | What it shows | Keys needed |
|---|---|---|
| [`mcp_tools_smoke.py`](./langchain/mcp_tools_smoke.py) | Loads all 36 MCP tools from `src/index.js` into LangChain via [`langchain-mcp-adapters`](https://github.com/langchain-ai/langchain-mcp-adapters) and calls `ted_search_tenders` directly. | none |
| [`mcp_langgraph_agent.py`](./langchain/mcp_langgraph_agent.py) | A LangGraph agent (LangChain v1 `create_agent`) that answers questions with the MCP tools and quotes the attribution. | an LLM provider key (e.g. `OPENAI_API_KEY`); optional `FINGRID_API_KEY` |
| [`apify_actors_tool.py`](./langchain/apify_actors_tool.py) | Runs the hosted `itulo/ted-tender-feed` actor through [`ApifyActorsTool`](https://docs.apify.com/platform/integrations/langchain) (no Node.js needed), directly or inside an agent. | `APIFY_TOKEN` (+ an LLM key for `--agent`) |

`mcp_tools_smoke.py` and `apify_actors_tool.py` (direct mode) were run against the live services; see the output format in each file's docstring.

## Data sources and licences

- TED (Tenders Electronic Daily), © European Union. EU consolidated financial sanctions list (European Commission). Both reused under the Commission reuse policy, Decision 2011/833/EU.
- PRH (Finnish Patent and Registration Office) open data, Fingrid, FMI and Fintraffic Digitraffic: CC BY 4.0.
- Full register: [`LICENCE_REGISTER.md`](../LICENCE_REGISTER.md).
