# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security & Data Protection Design

- **No secrets in code:** All 10 MCP servers operate on public EU and Finnish open-data endpoints. Only `fingrid-grid-signals` and `fmi-fingrid-nowcast` accept an optional `FINGRID_API_KEY` via environment variable.
- **GDPR company-level safeguards:** Natural-person names and residential addresses are stripped across PRH, TED, VIES sole-trader responses, and Digitraffic ship master/agent fields.
- **Mandatory legal attribution:** Every output record and error payload embeds the upstream open-data licence and attribution string from `licences.json`.

## Reporting a Vulnerability

Please report security issues by opening a GitHub security advisory on `https://github.com/itulo/eu-nordic-open-data-mcp/security/advisories/new`.
