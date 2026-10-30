"""Shared helper: where the unified stdio MCP server lives in this repo."""
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SERVER_ENTRY = REPO_ROOT / "src" / "index.js"


def mcp_server_config(env: dict | None = None) -> dict:
    """Config for langchain-mcp-adapters' MultiServerMCPClient (stdio transport).

    Requires Node.js >= 20 and `npm install` in the repo root.
    Only the fingrid_* (and fmi_fingrid_nowcast grid parts) need FINGRID_API_KEY;
    every other tool is keyless.
    """
    cfg = {
        "command": "node",
        "args": [str(SERVER_ENTRY)],
        "transport": "stdio",
    }
    if env:
        cfg["env"] = env
    return {"eu_nordic_open_data": cfg}
