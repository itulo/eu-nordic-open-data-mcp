"""LangChain standard unit tests (langchain-tests) for each tool."""
import pytest

pytest.importorskip("langchain_tests")
from langchain_tests.unit_tests import ToolsUnitTests  # noqa: E402

from langchain_eu_nordic_open_data import (  # noqa: E402
    EcbFxRatesTool,
    EuSanctionsScreenTool,
    EuViesVatValidateTool,
    TedTenderSearchTool,
)


class TestTedStandard(ToolsUnitTests):
    @property
    def tool_constructor(self):
        return TedTenderSearchTool

    @property
    def tool_invoke_params_example(self) -> dict:
        return {"cpvCodes": ["72000000"], "countries": ["FI"], "maxResults": 3}


class TestSanctionsStandard(ToolsUnitTests):
    @property
    def tool_constructor(self):
        return EuSanctionsScreenTool

    @property
    def tool_invoke_params_example(self) -> dict:
        return {"queries": ["Example Clean Company Oy"]}


class TestViesStandard(ToolsUnitTests):
    @property
    def tool_constructor(self):
        return EuViesVatValidateTool

    @property
    def tool_invoke_params_example(self) -> dict:
        return {"vatNumbers": ["FI01120389"]}


class TestEcbStandard(ToolsUnitTests):
    @property
    def tool_constructor(self):
        return EcbFxRatesTool

    @property
    def tool_invoke_params_example(self) -> dict:
        return {"currencies": ["USD"], "lastNObservations": 1}
