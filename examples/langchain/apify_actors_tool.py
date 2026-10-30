"""Use the hosted Apify actor itulo/ted-tender-feed from LangChain via ApifyActorsTool.

No Node.js needed: the actor runs on Apify (pay-per-event, billed to your Apify account).

    pip install -r examples/langchain/requirements.txt
    export APIFY_TOKEN=...           # https://console.apify.com/settings/integrations
    python examples/langchain/apify_actors_tool.py            # direct tool call, no LLM
    MODEL=openai:gpt-4.1-mini python examples/langchain/apify_actors_tool.py --agent   # with an agent
"""
import os
import sys

from langchain_apify import ApifyActorsTool

# The tool reads the actor's input schema, so the LLM sees cpvCodes, countries, alertMode, etc.
ted_tool = ApifyActorsTool("itulo/ted-tender-feed")


def direct_call() -> None:
    items = ted_tool.invoke(
        {"run_input": {"cpvCodes": ["72000000"], "countries": ["FI"], "maxResults": 5}}
    )
    print(f"{len(items)} notices")
    for n in items:
        print(f"  {n['publicationNumber']}  deadline {n.get('tenderDeadline') or 'n/a'}  {n['title'][:90]}")
    if items:
        print("\n" + items[0]["attribution"])


def agent_call() -> None:
    from langchain.agents import create_agent

    agent = create_agent(
        model=os.environ.get("MODEL", "openai:gpt-4.1-mini"),
        tools=[ted_tool],
        system_prompt="Use the TED tool for EU tenders. Quote the attribution field of the results you use.",
    )
    out = agent.invoke({"messages": [{"role": "user", "content": "Find open IT-services tenders (CPV 72000000) from Estonian buyers."}]})
    print(out["messages"][-1].content)


if __name__ == "__main__":
    agent_call() if "--agent" in sys.argv else direct_call()
