import json
import os

import pytest

import langchain_eu_nordic_open_data as pkg
from langchain_eu_nordic_open_data import _client, tools


class _FakeResp:
    def __init__(self, body):
        self._b = json.dumps(body).encode()

    def read(self):
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture
def captured(monkeypatch):
    calls = []

    def fake_urlopen(req, timeout=None):
        calls.append(req)
        return _FakeResp([{"title": "x", "attribution": "Source: TED"}])

    monkeypatch.setattr(_client.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setenv("APIFY_TOKEN", "test-token")
    return calls


def test_tool_names_unique_and_described():
    names = [cls().name for cls in tools.ALL_TOOL_CLASSES]
    assert len(names) == len(set(names)) == 9
    for cls in tools.ALL_TOOL_CLASSES:
        t = cls()
        assert len(t.description) > 40
        assert t.actor_id.startswith("itulo/")
        assert t.args_schema.model_json_schema()["properties"]


def test_ted_invoke_builds_request(captured):
    out = tools.TedTenderSearchTool().invoke({"cpvCodes": ["72000000"], "countries": ["FI"], "maxResults": 3})
    assert out[0]["attribution"] == "Source: TED"
    req = captured[0]
    assert "/acts/itulo~ted-tender-feed/run-sync-get-dataset-items" in req.full_url
    body = json.loads(req.data)
    assert body == {"cpvCodes": ["72000000"], "countries": ["FI"], "maxResults": 3}
    assert req.get_header("Authorization") == "Bearer test-token"


def test_vies_sets_mode(captured):
    tools.EuViesVatValidateTool().invoke({"vatNumbers": ["FI01120389"]})
    assert json.loads(captured[0].data) == {"mode": "validate_batch", "vatNumbers": ["FI01120389"]}


def test_ecb_default_modes(captured):
    tools.EcbFxRatesTool().invoke({"currencies": ["USD"]})
    assert json.loads(captured[0].data)["modes"] == ["fx_rates", "policy_rates", "hicp_inflation"]


def test_fingrid_key_from_env_not_from_llm(captured, monkeypatch):
    monkeypatch.setenv("FINGRID_API_KEY", "fg-key")
    tools.FingridGridSignalsTool().invoke({"modes": ["co2"]})
    body = json.loads(captured[0].data)
    assert body["fingridApiKey"] == "fg-key"
    assert "fingridApiKey" not in tools.FingridInput.model_json_schema()["properties"]


def test_get_tools_fingrid_toggle(monkeypatch):
    monkeypatch.delenv("FINGRID_API_KEY", raising=False)
    names = {t.name for t in pkg.get_tools()}
    assert "fingrid_grid_signals" not in names and "ted_tender_search" in names
    assert "fingrid_grid_signals" in {t.name for t in pkg.get_tools(include_fingrid=True)}


def test_missing_token(monkeypatch):
    monkeypatch.delenv("APIFY_TOKEN", raising=False)
    monkeypatch.delenv("APIFY_API_TOKEN", raising=False)
    with pytest.raises(pkg.ApifyError):
        tools.TedTenderSearchTool().invoke({"cpvCodes": ["72000000"]})


def test_token_not_in_repr():
    t = tools.TedTenderSearchTool(apify_token="secret-123")
    assert "secret-123" not in repr(t)



def test_async(captured):
    import asyncio

    out = asyncio.run(tools.EcbFxRatesTool().ainvoke({"currencies": ["SEK"]}))
    assert out and captured


@pytest.mark.skipif(not os.environ.get("LIVE_APIFY"), reason="set LIVE_APIFY=1 and APIFY_TOKEN for a live call (billed)")
def test_live_ecb():
    out = tools.EcbFxRatesTool(max_items=5).invoke({"modes": ["fx_rates"], "currencies": ["USD"], "lastNObservations": 1})
    assert out
