"""LangGraph agent (LangChain v1 `create_agent`) that uses the EU & Nordic open-data MCP server.

    npm install                      # in the repo root, once
    pip install -r examples/langchain/requirements.txt langchain-openai
    export OPENAI_API_KEY=...        # or any provider supported by init_chat_model
    export MODEL=openai:gpt-4.1-mini
    python examples/langchain/mcp_langgraph_agent.py "Any new Finnish IT-services tenders this week? Give deadlines."

Optional: export FINGRID_API_KEY=... (free key from data.fingrid.fi) to enable the fingrid_* tools.
"""
import asyncio
import os
import sys

from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient

from _common import mcp_server_config

SYSTEM_PROMPT = (
    "You answer questions with official EU and Finnish open data returned by the tools. "
    "Always end your answer with the 'attribution' text from the tool results you used, "
    "and link the source records (e.g. TED notice URLs). "
    "Sanctions screening results are informational aids, not legal determinations."
)


async def main(question: str) -> None:
    env = {"PATH": os.environ.get("PATH", "")}
    if os.environ.get("FINGRID_API_KEY"):
        env["FINGRID_API_KEY"] = os.environ["FINGRID_API_KEY"]

    client = MultiServerMCPClient(mcp_server_config(env))
    tools = await client.get_tools()

    agent = create_agent(
        model=os.environ.get("MODEL", "openai:gpt-4.1-mini"),
        tools=tools,
        system_prompt=SYSTEM_PROMPT,
    )
    result = await agent.ainvoke({"messages": [{"role": "user", "content": question}]})
    print(result["messages"][-1].content)


if __name__ == "__main__":
    q = " ".join(sys.argv[1:]) or (
        "List new contract notices from Finnish or Swedish buyers for CPV 72000000 "
        "published in the last 7 days, with buyer, deadline and TED link."
    )
    asyncio.run(main(q))
