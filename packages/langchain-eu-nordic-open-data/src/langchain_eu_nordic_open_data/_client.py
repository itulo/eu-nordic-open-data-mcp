"""Minimal Apify client: run an actor synchronously and return its dataset items."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

APIFY_API = "https://api.apify.com/v2"


class ApifyError(RuntimeError):
    """Raised when an Apify actor run fails or the API returns an error."""


def get_token(token: str | None = None) -> str:
    tok = token or os.environ.get("APIFY_TOKEN") or os.environ.get("APIFY_API_TOKEN")
    if not tok:
        raise ApifyError(
            "No Apify token. Set APIFY_TOKEN (https://console.apify.com/settings/integrations) "
            "or pass apify_token= to the tool."
        )
    return tok


def run_actor_sync(
    actor_id: str,
    run_input: dict[str, Any],
    *,
    token: str | None = None,
    timeout_secs: int = 300,
    max_items: int | None = None,
) -> list[dict[str, Any]]:
    """POST /v2/acts/{actor}/run-sync-get-dataset-items and return the JSON items."""
    params: dict[str, Any] = {"timeout": timeout_secs}
    if max_items:
        params["maxItems"] = max_items
    url = f"{APIFY_API}/acts/{actor_id.replace('/', '~')}/run-sync-get-dataset-items?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        data=json.dumps(run_input).encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {get_token(token)}",
            "User-Agent": "langchain-eu-nordic-open-data/0.1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_secs + 30) as resp:
            body = resp.read().decode()
    except urllib.error.HTTPError as e:  # pragma: no cover - network path
        detail = e.read().decode(errors="replace")[:500]
        raise ApifyError(f"Apify actor {actor_id} failed: HTTP {e.code}: {detail}") from None
    data = json.loads(body) if body else []
    if isinstance(data, dict) and "error" in data:
        raise ApifyError(f"Apify actor {actor_id} failed: {data['error']}")
    return data if isinstance(data, list) else [data]
