"""LangChain tools backed by the hosted itulo/* Apify actors.

Every record returned by the actors carries the upstream licence / attribution
fields (e.g. ``attribution``, ``licence``); keep them when you show or store results.
Actors are pay-per-event and billed to the Apify account of the token you use.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any, ClassVar, Literal, Optional

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from ._client import run_actor_sync


class _ApifyActorTool(BaseTool):
    """Base class: maps validated tool args 1:1 onto an Apify actor input."""

    actor_id: ClassVar[str] = ""
    apify_token: Optional[str] = Field(default=None, exclude=True, repr=False)
    timeout_secs: int = 300
    max_items: Optional[int] = None

    def _build_input(self, **kwargs: Any) -> dict[str, Any]:
        return {k: v for k, v in kwargs.items() if v is not None}

    def _run(self, run_manager: Any = None, **kwargs: Any) -> list[dict[str, Any]]:
        return run_actor_sync(
            self.actor_id,
            self._build_input(**kwargs),
            token=self.apify_token,
            timeout_secs=self.timeout_secs,
            max_items=self.max_items,
        )

    async def _arun(self, run_manager: Any = None, **kwargs: Any) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._run, None, **kwargs)


# --- TED (EU public procurement) -------------------------------------------------
class TedTendersInput(BaseModel):
    cpvCodes: list[str] = Field(description="CPV codes to match, e.g. ['72000000'] for IT services. Prefix match.")
    countries: Optional[list[str]] = Field(default=None, description="ISO country codes (e.g. ['FI','SE','EE']).")
    countryField: Optional[Literal["buyer", "performance"]] = Field(default=None, description="Match countries on buyer (default) or place of performance.")
    noticeTypes: Optional[list[str]] = Field(default=None, description="Notice type groups, e.g. ['competition'] (default) or ['result'].")
    publishedFrom: Optional[str] = Field(default=None, description="Earliest publication date YYYY-MM-DD.")
    publishedTo: Optional[str] = Field(default=None, description="Latest publication date YYYY-MM-DD.")
    maxResults: Optional[int] = Field(default=25, ge=1, le=1000, description="Maximum notices to return.")
    language: Optional[str] = Field(default=None, description="Preferred title language (3-letter, default 'eng').")


class TedTenderSearchTool(_ApifyActorTool):
    """Search EU tender notices in TED (Tenders Electronic Daily) by CPV code and country."""

    name: str = "ted_tender_search"
    description: str = (
        "Search official EU public procurement notices (TED, Publications Office of the EU) by CPV code, "
        "buyer country and publication date. Returns notice number, title, buyer, deadline, value and a "
        "TED link plus the source attribution. Read-only."
    )
    args_schema: type[BaseModel] = TedTendersInput
    actor_id: ClassVar[str] = "itulo/ted-tender-feed"


# --- EU financial sanctions ------------------------------------------------------
class SanctionsInput(BaseModel):
    queries: list[str] = Field(description="Entity names, aliases or identifiers to screen against the EU consolidated financial sanctions list.")
    subjectType: Optional[Literal["all", "person", "enterprise"]] = Field(default=None, description="Restrict matches to persons or enterprises.")
    country: Optional[str] = Field(default=None, description="ISO-2 country filter.")
    fuzzyThreshold: Optional[float] = Field(default=None, ge=0.5, le=1.0, description="Fuzzy name similarity threshold (default 0.78).")
    maxMatchesPerQuery: Optional[int] = Field(default=None, ge=1, le=50, description="Max matches per query (default 5).")


class EuSanctionsScreenTool(_ApifyActorTool):
    """Screen names against the EU consolidated financial sanctions list (European Commission, DG FISMA)."""

    name: str = "eu_sanctions_screen"
    description: str = (
        "Screen company or entity names against the EU consolidated list of persons, groups and entities "
        "subject to EU financial sanctions. Returns match/clear status, similarity score, programme and the "
        "official list reference. A screening aid, not legal advice; confirm hits against the official list."
    )
    args_schema: type[BaseModel] = SanctionsInput
    actor_id: ClassVar[str] = "itulo/eu-sanctions-screen"


# --- VIES VAT ---------------------------------------------------------------------
class ViesInput(BaseModel):
    vatNumbers: list[str] = Field(description="EU VAT numbers with country prefix, e.g. ['FI01120389', 'DE811569869'].")
    supplierCountryCode: Optional[str] = Field(default=None, description="Your (supplier) country code, used for the intra-EU reverse-charge hint.")


class EuViesVatValidateTool(_ApifyActorTool):
    """Validate EU VAT numbers in VIES (European Commission)."""

    name: str = "eu_vies_vat_validate"
    description: str = (
        "Validate a batch of EU VAT numbers against the European Commission VIES service. Returns valid/invalid, "
        "the registered company name and country, and a reverse-charge hint. Personal data of sole traders is redacted."
    )
    args_schema: type[BaseModel] = ViesInput
    actor_id: ClassVar[str] = "itulo/eu-vies-vat-validator"

    def _build_input(self, **kwargs: Any) -> dict[str, Any]:
        return {"mode": "validate_batch", **super()._build_input(**kwargs)}


# --- ECB --------------------------------------------------------------------------
class EcbInput(BaseModel):
    modes: Optional[list[Literal["fx_rates", "policy_rates", "hicp_inflation"]]] = Field(default=None, description="What to fetch (default: all three).")
    currencies: Optional[list[str]] = Field(default=None, description="Currencies quoted against EUR, e.g. ['USD','SEK'].")
    lastNObservations: Optional[int] = Field(default=None, ge=1, le=500, description="Last N observations per series.")
    startPeriod: Optional[str] = Field(default=None, description="Start date YYYY-MM-DD.")
    endPeriod: Optional[str] = Field(default=None, description="End date YYYY-MM-DD.")
    inflationAreas: Optional[list[str]] = Field(default=None, description="HICP reference areas, e.g. ['U2','FI'].")


class EcbFxRatesTool(_ApifyActorTool):
    """ECB euro reference FX rates, key policy rates and HICP inflation."""

    name: str = "ecb_fx_rates_macro"
    description: str = (
        "Fetch European Central Bank euro foreign exchange reference rates, key ECB interest rates and HICP "
        "inflation from the ECB Data Portal (SDMX). Returns dated observations with ECB source attribution."
    )
    args_schema: type[BaseModel] = EcbInput
    actor_id: ClassVar[str] = "itulo/ecb-fx-rates-macro"

    def _build_input(self, **kwargs: Any) -> dict[str, Any]:
        out = super()._build_input(**kwargs)
        out.setdefault("modes", ["fx_rates", "policy_rates", "hicp_inflation"])
        return out


# --- PRH (Finnish Trade Register) -------------------------------------------------
class PrhInput(BaseModel):
    eventTypes: Optional[list[str]] = Field(default=None, description="Event types, e.g. ['new_company','name_change','liquidation','bankruptcy'].")
    dateFrom: Optional[str] = Field(default=None, description="From date YYYY-MM-DD.")
    dateTo: Optional[str] = Field(default=None, description="To date YYYY-MM-DD.")
    location: Optional[str] = Field(default=None, description="Finnish town/city, e.g. 'Helsinki'.")
    companyForm: Optional[str] = Field(default=None, description="Company form code, e.g. 'OY'.")
    maxPerEvent: Optional[int] = Field(default=50, ge=1, le=5000, description="Max records per event type.")
    watchBusinessIds: Optional[list[str]] = Field(default=None, description="Finnish Business IDs (Y-tunnus) to watch instead of a date-range feed.")


class PrhCompanyEventsTool(_ApifyActorTool):
    """Finnish company register events (PRH / YTJ open data)."""

    name: str = "prh_company_events"
    description: str = (
        "List Finnish companies' register events from the Finnish Patent and Registration Office (PRH) open data: "
        "new companies, name changes, liquidations, bankruptcies, or changes for a watchlist of Business IDs. "
        "Company-level data only; sole-trader personal data is filtered out."
    )
    args_schema: type[BaseModel] = PrhInput
    actor_id: ClassVar[str] = "itulo/prh-company-events"


# --- FMI weather warnings ---------------------------------------------------------
class FmiAlertsInput(BaseModel):
    modes: Optional[list[Literal["active_alerts", "weather_observations", "sea_level_observations"]]] = Field(default=None, description="Data modes to include.")
    language: Optional[Literal["en-GB", "fi-FI"]] = Field(default=None, description="Alert language.")
    minSeverity: Optional[Literal["Minor", "Moderate", "Severe", "Extreme"]] = Field(default=None, description="Minimum CAP severity.")
    regionFilter: Optional[str] = Field(default=None, description="Region or sea-area name filter.")
    places: Optional[list[str]] = Field(default=None, description="Observation places, e.g. ['Helsinki','Oulu'].")


class FmiWeatherAlertsTool(_ApifyActorTool):
    """Finnish Meteorological Institute warnings and observations."""

    name: str = "fmi_weather_alerts"
    description: str = (
        "Get active Finnish Meteorological Institute (FMI) weather and marine warnings (CAP), latest weather "
        "observations and coastal sea levels for Finland, with FMI CC BY 4.0 attribution."
    )
    args_schema: type[BaseModel] = FmiAlertsInput
    actor_id: ClassVar[str] = "itulo/fmi-weather-warnings-alerts"


# --- Digitraffic port calls -------------------------------------------------------
class PortCallsInput(BaseModel):
    modes: Optional[list[Literal["port_calls", "port_congestion_summary"]]] = Field(default=None, description="Output modes.")
    ports: Optional[list[str]] = Field(default=None, description="Port UN/LOCODEs, e.g. ['FIHEL','FITKU']; empty = all Finnish ports.")
    cargoOnly: Optional[bool] = Field(default=None, description="Cargo vessels only.")
    vesselQuery: Optional[str] = Field(default=None, description="Vessel name, IMO or call sign.")
    maxResults: Optional[int] = Field(default=None, ge=1, le=1000, description="Max port call records.")


class DigitrafficPortCallsTool(_ApifyActorTool):
    """Finnish port calls from Fintraffic Digitraffic Marine."""

    name: str = "digitraffic_port_calls"
    description: str = (
        "List vessel port calls (ETA/ETD/ATA) and a congestion summary for Finnish ports from Fintraffic "
        "Digitraffic Marine open data (CC BY 4.0)."
    )
    args_schema: type[BaseModel] = PortCallsInput
    actor_id: ClassVar[str] = "itulo/digitraffic-port-calls-marine"


# --- Fingrid (needs a free Fingrid key) -------------------------------------------
class FingridInput(BaseModel):
    modes: Optional[list[Literal["grid_snapshot", "cheap_hours", "co2", "consumption_production", "renewables", "frequency", "reserves", "imbalance"]]] = Field(default=None, description="Signals to fetch.")
    hoursBack: Optional[int] = Field(default=None, ge=1, le=168, description="History window in hours.")
    hoursAhead: Optional[int] = Field(default=None, ge=1, le=72, description="Forecast window in hours (cheap_hours).")
    topN: Optional[int] = Field(default=None, ge=1, le=24, description="Number of low-demand/low-CO2 hour candidates.")


class _FingridKeyMixin(_ApifyActorTool):
    fingrid_api_key: Optional[str] = Field(default=None, exclude=True, repr=False)

    def _build_input(self, **kwargs: Any) -> dict[str, Any]:
        out = super()._build_input(**kwargs)
        key = self.fingrid_api_key or os.environ.get("FINGRID_API_KEY")
        if key:
            out["fingridApiKey"] = key
        return out


class FingridGridSignalsTool(_FingridKeyMixin):
    """Finnish power-grid signals from Fingrid open data (no exchange prices)."""

    name: str = "fingrid_grid_signals"
    description: str = (
        "Get Finnish transmission-grid signals from Fingrid Open Data (CC BY 4.0): production/consumption "
        "snapshot, frequency, CO2 intensity and forecast low-load hours. No electricity exchange prices. "
        "Requires a free Fingrid API key (FINGRID_API_KEY)."
    )
    args_schema: type[BaseModel] = FingridInput
    actor_id: ClassVar[str] = "itulo/fingrid-grid-signals"


class NowcastInput(BaseModel):
    mode: Optional[Literal["joined_nowcast", "station_weather"]] = Field(default=None, description="joined_nowcast needs a Fingrid key; station_weather is keyless.")
    places: Optional[list[str]] = Field(default=None, description="Finnish hubs, e.g. ['Oulu','Vaasa','Helsinki'].")
    hoursAhead: Optional[int] = Field(default=None, ge=1, le=72, description="Forecast horizon in hours.")
    topN: Optional[int] = Field(default=None, ge=1, le=24, description="Recommended low-load/high-renewables hours.")


class FmiFingridNowcastTool(_FingridKeyMixin):
    """FMI weather forecast joined with Fingrid wind/solar/load."""

    name: str = "fmi_fingrid_nowcast"
    description: str = (
        "Join FMI weather forecasts for Finnish hubs with Fingrid wind, solar and load forecasts to suggest "
        "renewable-rich hours. Keyless in station_weather mode; joined_nowcast needs FINGRID_API_KEY."
    )
    args_schema: type[BaseModel] = NowcastInput
    actor_id: ClassVar[str] = "itulo/fmi-fingrid-nowcast"


ALL_TOOL_CLASSES: tuple[type[_ApifyActorTool], ...] = (
    TedTenderSearchTool,
    EuSanctionsScreenTool,
    EuViesVatValidateTool,
    EcbFxRatesTool,
    PrhCompanyEventsTool,
    FmiWeatherAlertsTool,
    DigitrafficPortCallsTool,
    FingridGridSignalsTool,
    FmiFingridNowcastTool,
)


def get_tools(apify_token: Optional[str] = None, *, include_fingrid: Optional[bool] = None) -> list[BaseTool]:
    """Return all tools. Fingrid tools are included when a FINGRID_API_KEY is set (or include_fingrid=True)."""
    if include_fingrid is None:
        include_fingrid = bool(os.environ.get("FINGRID_API_KEY"))
    tools: list[BaseTool] = []
    for cls in ALL_TOOL_CLASSES:
        if cls is FingridGridSignalsTool and not include_fingrid:
            continue
        tools.append(cls(apify_token=apify_token))
    return tools
