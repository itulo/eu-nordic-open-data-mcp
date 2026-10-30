"""Load the 36 MCP tools into LangChain and call one directly. No LLM and no API key needed.

    npm install                      # in the repo root, once
    pip install -r examples/langchain/requirements.txt
    python examples/langchain/mcp_tools_smoke.py
"""
import asyncio
import json

from langchain_mcp_adapters.client import MultiServerMCPClient

from _common import mcp_server_config


async def main() -> None:
    client = MultiServerMCPClient(mcp_server_config())
    tools = await client.get_tools()
    print(f"Loaded {len(tools)} LangChain tools from the MCP server")
    for t in sorted(tools, key=lambda t: t.name):
        print(f"  - {t.name}")

    ted = next(t for t in tools if t.name == "ted_search_tenders")
    # IT services (CPV 72000000, children included) bought by Finnish buyers, last 7 days by default.
    raw = await ted.ainvoke({"cpvCodes": ["72000000"], "countries": ["FI"], "maxResults": 5})
    # MCP tools return a list of content blocks; the first block is the JSON envelope.
    text = raw[0]["text"] if isinstance(raw, list) and isinstance(raw[0], dict) else (raw[0] if isinstance(raw, (list, tuple)) else raw)
    data = json.loads(text if isinstance(text, str) else str(text))
    print(f"\nTED: {data['totalMatching']} matching notices, showing {data['returned']}:")
    for r in data["records"]:
        print(f"  {r['publicationNumber']}  deadline {r.get('tenderDeadline') or 'n/a'}  {r['title'][:90]}")
    print("\n" + data["attribution"])


if __name__ == "__main__":
    asyncio.run(main())
