# Installing eu-nordic-open-data-mcp (instructions for AI coding agents)

A local **stdio** MCP server (Node.js ≥ 20) with 36 tools over official EU and Finnish open data. You don't need an API key. The Fingrid tools optionally take a free `FINGRID_API_KEY`.

## 1. Clone and install

```bash
git clone https://github.com/itulo/eu-nordic-open-data-mcp.git
cd eu-nordic-open-data-mcp
npm install
```

Check that it starts. It speaks JSON-RPC on stdio and logs only to stderr. Stop it with Ctrl+C:

```bash
node src/index.js
```

## 2. Add it to the MCP client config

Use the **absolute path** of the cloned folder:

```json
{
  "mcpServers": {
    "eu-nordic-open-data": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/eu-nordic-open-data-mcp/src/index.js"],
      "env": {
        "FINGRID_API_KEY": ""
      }
    }
  }
}
```

- Cline: `cline_mcp_settings.json`
- Claude Desktop: `claude_desktop_config.json`
- Cursor: `.cursor/mcp.json`

You can drop `FINGRID_API_KEY`, or leave it empty. Without it, only the `fingrid_*` tools return an "API key required" message; everything else works. Users can get a free key at https://data.fingrid.fi.

## 3. Verify

Ask the agent to call `ted_search_tenders` with `{"cpvCodes":["72000000"],"countries":["FI"],"maxResults":3}`. It should return EU tender notices with an `attribution` field.

Other no-key tools to try:
- `eu_sanctions_screen` with `{"queries":["Example Name"]}`
- `vies_validate_vat_batch` with `{"vatNumbers":["FI01120389"]}`
- `ecb_fx_rates`
- `prh_company_events`
- `fmi_active_alerts`
- `digitraffic_port_calls`

## Notes

- Keep the `attribution` / `licence` fields when quoting results:
  - Fingrid, FMI, PRH and Digitraffic: CC BY 4.0
  - TED and EU sanctions: © European Union, reused under Commission Decision 2011/833/EU
- Sanctions results are an informational aid, not legal advice.
