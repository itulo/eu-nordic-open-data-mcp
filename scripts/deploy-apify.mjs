// Deploy, build, smoke-test, and configure pay-per-event / store metadata on Apify.
// Never logs or prints APIFY_TOKEN or FINGRID_API_KEY.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) {
  console.error('APIFY_TOKEN is not set in environment');
  process.exit(1);
}

const API = 'https://api.apify.com/v2';

export async function api(method, endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, data: json.data, error: json.error || (!res.ok ? json : null) };
}

export function collectSourceFiles(toolDir) {
  const files = [];
  const skipDirs = new Set(['node_modules', 'storage', '.git']);
  const skipFiles = new Set(['package-lock.json']);
  function walk(relDir) {
    const absDir = path.join(toolDir, relDir);
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(relPath);
      } else if (entry.isFile()) {
        if (skipFiles.has(entry.name)) continue;
        const content = fs.readFileSync(path.join(toolDir, relPath), 'utf8');
        files.push({ name: relPath, format: 'TEXT', content });
      }
    }
  }
  walk('');
  return files;
}

export const ACTOR_CONFIGS = {
  "ted-tender-feed": {
    "categories": [
      "BUSINESS",
      "LEAD_GENERATION",
      "AUTOMATION"
    ],
    "seoTitle": "EU Tender Feed (TED) — Public Procurement Notices API",
    "seoDescription": "Search and monitor official EU TED public procurement notices by CPV code, country, and date with deduplication and incremental alert mode.",
    "exampleInput": {
      "cpvCodes": [
        "72000000"
      ],
      "countries": [
        "FIN"
      ],
      "countryField": "buyer",
      "noticeTypes": [
        "competition"
      ],
      "maxResults": 5,
      "language": "eng",
      "collapseByProcedure": false,
      "alertMode": false
    },
    "smokeInput": {
      "countries": [
        "FIN"
      ],
      "countryField": "buyer",
      "maxResults": 5,
      "language": "eng",
      "alertMode": false
    },
    "pricing": {
      "pricingModel": "PAY_PER_EVENT",
      "apifyMarginPercentage": 0.2,
      "minimalMaxTotalChargeUsd": 0.05,
      "pricingPerEvent": {
        "actorChargeEvents": {
          "actor-start": {
            "eventTitle": "Actor start",
            "eventDescription": "Flat fee for starting an Actor run.",
            "eventPriceUsd": 0.01,
            "isOneTimeEvent": true
          },
          "tender-notice": {
            "eventTitle": "Tender notice",
            "eventDescription": "Each normalized EU public procurement notice written to the dataset ($3.00 per 1,000 notices).",
            "eventPriceUsd": 0.003,
            "isPrimaryEvent": true,
            "isOneTimeEvent": false
          }
        }
      }
    }
  },
  "prh-company-events": {
    "categories": [
      "BUSINESS",
      "LEAD_GENERATION",
      "AUTOMATION"
    ],
    "seoTitle": "Finnish Company Events Feed (PRH / YTJ Open Data)",
    "seoDescription": "Track daily Finnish Trade Register company events (new companies, name changes, liquidations, bankruptcies, restructurings) and watchlist diffs.",
    "exampleInput": {
      "eventTypes": [
        "new_company",
        "name_change",
        "liquidation",
        "bankruptcy"
      ],
      "maxPerEvent": 10,
      "alertMode": false
    },
    "smokeInput": {
      "eventTypes": [
        "new_company",
        "name_change"
      ],
      "dateFrom": "2026-10-15",
      "dateTo": "2026-10-27",
      "maxPerEvent": 5,
      "alertMode": false
    },
    "pricing": {
      "pricingModel": "PAY_PER_EVENT",
      "apifyMarginPercentage": 0.2,
      "minimalMaxTotalChargeUsd": 0.05,
      "pricingPerEvent": {
        "actorChargeEvents": {
          "actor-start": {
            "eventTitle": "Actor start",
            "eventDescription": "Flat fee for starting an Actor run.",
            "eventPriceUsd": 0.01,
            "isOneTimeEvent": true
          },
          "company-event": {
            "eventTitle": "Company event",
            "eventDescription": "Each normalized Finnish company event or watchlist change written to the dataset ($2.00 per 1,000 events).",
            "eventPriceUsd": 0.002,
            "isPrimaryEvent": true,
            "isOneTimeEvent": false
          }
        }
      }
    }
  },
  "eu-sanctions-screen": {
    "categories": [
      "BUSINESS",
      "AUTOMATION",
      "DEVELOPER_TOOLS"
    ],
    "seoTitle": "EU Consolidated Financial Sanctions Screening (FSF)",
    "seoDescription": "Screen names, companies & IDs against the official EU Consolidated Financial Sanctions List (DG FISMA FSF) with exact & possible-match fuzzy scoring.",
    "exampleInput": {
      "queries": [
        "Saddam Hussein Al-Tikriti",
        "Example Clean Company Oy"
      ],
      "subjectType": "all",
      "fuzzyThreshold": 0.78,
      "maxMatchesPerQuery": 5,
      "includeClearQueries": true
    },
    "smokeInput": {
      "queries": [
        "Saddam Hussein Al-Tikriti",
        "Sadam Husein Al Tikriti",
        "Clean Nordic Company Oy"
      ],
      "subjectType": "all",
      "fuzzyThreshold": 0.75,
      "maxMatchesPerQuery": 3,
      "includeClearQueries": true
    },
    "pricing": {
      "pricingModel": "PAY_PER_EVENT",
      "apifyMarginPercentage": 0.2,
      "minimalMaxTotalChargeUsd": 0.05,
      "pricingPerEvent": {
        "actorChargeEvents": {
          "actor-start": {
            "eventTitle": "Actor start",
            "eventDescription": "Flat fee for starting an Actor run.",
            "eventPriceUsd": 0.01,
            "isOneTimeEvent": true
          },
          "screened-query": {
            "eventTitle": "Screened query / entity row",
            "eventDescription": "Each screened query or sanctions match row written to the dataset ($2.00 per 1,000 queries).",
            "eventPriceUsd": 0.002,
            "isPrimaryEvent": true,
            "isOneTimeEvent": false
          }
        }
      }
    }
  },
  "fingrid-grid-signals": {
    "categories": [
      "BUSINESS",
      "AUTOMATION",
      "DEVELOPER_TOOLS"
    ],
    "seoTitle": "Finnish Power Grid & Reserve Signals (Fingrid Open Data API)",
    "seoDescription": "Real-time & forecast Finnish power grid data from Fingrid Open Data: consumption, wind/solar, reserve prices, imbalance, CO2 intensity & cheap-hour rankings.",
    "exampleInput": {
      "modes": [
        "grid_snapshot",
        "cheap_hours",
        "co2"
      ],
      "hoursBack": 24,
      "hoursAhead": 36,
      "topN": 6
    },
    "pricing": {
      "pricingModel": "PAY_PER_EVENT",
      "apifyMarginPercentage": 0.2,
      "minimalMaxTotalChargeUsd": 0.05,
      "pricingPerEvent": {
        "actorChargeEvents": {
          "actor-start": {
            "eventTitle": "Actor start",
            "eventDescription": "Flat fee for starting an Actor run.",
            "eventPriceUsd": 0.01,
            "isOneTimeEvent": true
          },
          "derived-signal": {
            "eventTitle": "Derived grid signal (cheap_hours or co2)",
            "eventDescription": "Each derived cheap/low-carbon hour ranking or CO2 intensity classification computed from Fingrid Open Data.",
            "eventPriceUsd": 0.005,
            "isPrimaryEvent": true,
            "isOneTimeEvent": false
          },
          "data-records": {
            "eventTitle": "100 time-series observations",
            "eventDescription": "Per 100 normalized Fingrid Open Data time-series records written to the dataset ($1.00 per 1,000 observations).",
            "eventPriceUsd": 0.1,
            "isPrimaryEvent": false,
            "isOneTimeEvent": false
          }
        }
      }
    }
  },
  "fmi-fingrid-nowcast": {
    "categories": [
      "BUSINESS",
      "AUTOMATION",
      "DEVELOPER_TOOLS"
    ],
    "seoTitle": "FMI Weather + Fingrid Wind/Solar Nowcast Feed (Finland)",
    "seoDescription": "Hourly joined feature feed combining FMI meteorological hub forecasts with Fingrid wind, solar & consumption forecasts and EV smart-charging rankings.",
    "exampleInput": {
      "mode": "joined_nowcast",
      "places": [
        "Oulu",
        "Vaasa",
        "Pori",
        "Helsinki",
        "Lappeenranta"
      ],
      "hoursBack": 6,
      "hoursAhead": 36,
      "topN": 6,
      "includeStationBreakdown": false
    },
    "pricing": {
      "pricingModel": "PAY_PER_EVENT",
      "apifyMarginPercentage": 0.2,
      "minimalMaxTotalChargeUsd": 0.05,
      "pricingPerEvent": {
        "actorChargeEvents": {
          "actor-start": {
            "eventTitle": "Actor start",
            "eventDescription": "Flat fee for starting an Actor run.",
            "eventPriceUsd": 0.01,
            "isOneTimeEvent": true
          },
          "nowcast-hour": {
            "eventTitle": "Joined hourly nowcast record",
            "eventDescription": "Each joined FMI weather + Fingrid wind/solar/consumption hourly nowcast record written to the dataset ($1.00 per 1,000 hours).",
            "eventPriceUsd": 0.001,
            "isPrimaryEvent": true,
            "isOneTimeEvent": false
          }
        }
      }
    }
  },
  "fmi-weather-warnings-alerts": {
    "categories": [
      "BUSINESS",
      "AUTOMATION",
      "DEVELOPER_TOOLS"
    ],
    "seoTitle": "Finland Severe Weather & Baltic Marine Alerts (FMI CAP/WFS)",
    "seoDescription": "Real-time Finnish Meteorological Institute (FMI) CAP 1.2 weather, wind & wave alerts plus live synoptic weather and Baltic mareograph sea-level observations.",
    "exampleInput": {
      "modes": [
        "active_alerts",
        "weather_observations",
        "sea_level_observations"
      ],
      "language": "en-GB",
      "minSeverity": "Minor",
      "maxAlerts": 20,
      "places": [
        "Helsinki",
        "Turku",
        "Tampere",
        "Vaasa",
        "Oulu",
        "Rovaniemi"
      ],
      "hoursBack": 2,
      "maxSeaStations": 10
    },
    "pricing": {
      "pricingModel": "PAY_PER_EVENT",
      "apifyMarginPercentage": 0.2,
      "minimalMaxTotalChargeUsd": 0.05,
      "pricingPerEvent": {
        "actorChargeEvents": {
          "actor-start": {
            "eventTitle": "Actor start",
            "eventDescription": "Flat fee for starting an Actor run.",
            "eventPriceUsd": 0.01,
            "isOneTimeEvent": true
          },
          "weather-alert-or-obs": {
            "eventTitle": "Weather/marine alert or station observation",
            "eventDescription": "Each normalized FMI CAP alert, synoptic weather observation, or Baltic mareograph sea-level observation written to the dataset ($1.50 per 1,000 records).",
            "eventPriceUsd": 0.0015,
            "isPrimaryEvent": true,
            "isOneTimeEvent": false
          }
        }
      }
    }
  },
  "eu-vies-vat-validator": {
    "categories": [
      "BUSINESS",
      "LEAD_GENERATION",
      "AUTOMATION"
    ],
    "seoTitle": "EU VIES VAT Number Batch Validator & Reverse-Charge Check",
    "seoDescription": "Batch-validate EU & XI VAT numbers against the official European Commission VIES REST API with B2B reverse-charge flags and automatic GDPR sole-trader redaction.",
    "exampleInput": {
      "mode": "validate_batch",
      "vatNumbers": [
        "FI01120389",
        "FI10728943"
      ],
      "supplierCountryCode": "FI",
      "includeMemberStateStatus": false
    },
    "pricing": {
      "pricingModel": "PAY_PER_EVENT",
      "apifyMarginPercentage": 0.2,
      "minimalMaxTotalChargeUsd": 0.05,
      "pricingPerEvent": {
        "actorChargeEvents": {
          "actor-start": {
            "eventTitle": "Actor start",
            "eventDescription": "Flat fee for starting an Actor run.",
            "eventPriceUsd": 0.01,
            "isOneTimeEvent": true
          },
          "vat-check": {
            "eventTitle": "EU VIES VAT validation or status record",
            "eventDescription": "Each EU/XI VAT number validated against VIES or Member State status row written to the dataset ($2.50 per 1,000 checks).",
            "eventPriceUsd": 0.0025,
            "isPrimaryEvent": true,
            "isOneTimeEvent": false
          }
        }
      }
    }
  },
  "ecb-fx-rates-macro": {
    "categories": [
      "BUSINESS",
      "AUTOMATION",
      "DEVELOPER_TOOLS"
    ],
    "seoTitle": "ECB EUR FX Rates, Policy Rates, Inflation & Invoice Tool",
    "seoDescription": "Official European Central Bank (ECB SDMX 2.1) EUR reference exchange rates, Eurosystem policy interest rates, HICP inflation, and B2B invoice currency converter.",
    "exampleInput": {
      "modes": [
        "fx_rates",
        "policy_rates",
        "hicp_inflation",
        "invoice_converter"
      ],
      "currencies": [
        "USD",
        "GBP",
        "SEK",
        "NOK",
        "DKK",
        "CHF",
        "JPY",
        "PLN"
      ],
      "lastNObservations": 5,
      "inflationAreas": [
        "U2",
        "FI",
        "DE",
        "FR"
      ],
      "invoices": [
        {
          "invoiceId": "INV-001",
          "amount": 1500,
          "fromCurrency": "USD",
          "toCurrency": "EUR"
        },
        {
          "invoiceId": "INV-002",
          "amount": 25000,
          "fromCurrency": "SEK",
          "toCurrency": "EUR"
        }
      ]
    },
    "pricing": {
      "pricingModel": "PAY_PER_EVENT",
      "apifyMarginPercentage": 0.2,
      "minimalMaxTotalChargeUsd": 0.05,
      "pricingPerEvent": {
        "actorChargeEvents": {
          "actor-start": {
            "eventTitle": "Actor start",
            "eventDescription": "Flat fee for starting an Actor run.",
            "eventPriceUsd": 0.01,
            "isOneTimeEvent": true
          },
          "macro-or-fx-record": {
            "eventTitle": "ECB FX rate, macro indicator, or converted invoice row",
            "eventDescription": "Each official ECB FX rate, policy interest rate, HICP inflation reading, or converted invoice row written to the dataset ($1.00 per 1,000 records).",
            "eventPriceUsd": 0.001,
            "isPrimaryEvent": true,
            "isOneTimeEvent": false
          }
        }
      }
    }
  },
  "digitraffic-port-calls-marine": {
    "categories": [
      "BUSINESS",
      "AUTOMATION",
      "DEVELOPER_TOOLS"
    ],
    "seoTitle": "Baltic & Finland Port Calls & Congestion (Digitraffic)",
    "seoDescription": "Real-time & scheduled Baltic Sea and Finnish vessel port calls, ETA/ETD berth schedules, turnaround times, and port congestion summaries (Fintraffic CC BY 4.0).",
    "exampleInput": {
      "modes": [
        "port_calls",
        "port_congestion_summary"
      ],
      "ports": [
        "FIHEL",
        "FITKU",
        "FIHKO",
        "FIKTK"
      ],
      "cargoOnly": false,
      "maxResults": 30
    },
    "pricing": {
      "pricingModel": "PAY_PER_EVENT",
      "apifyMarginPercentage": 0.2,
      "minimalMaxTotalChargeUsd": 0.05,
      "pricingPerEvent": {
        "actorChargeEvents": {
          "actor-start": {
            "eventTitle": "Actor start",
            "eventDescription": "Flat fee for starting an Actor run.",
            "eventPriceUsd": 0.01,
            "isOneTimeEvent": true
          },
          "port-call-record": {
            "eventTitle": "Vessel port call or port congestion summary row",
            "eventDescription": "Each normalized vessel port call schedule or port congestion summary row written to the dataset ($1.50 per 1,000 records).",
            "eventPriceUsd": 0.0015,
            "isPrimaryEvent": true,
            "isOneTimeEvent": false
          }
        }
      }
    }
  },
  "enisa-euvd-vulnerabilities": {
    "categories": [
      "BUSINESS",
      "AUTOMATION",
      "DEVELOPER_TOOLS"
    ],
    "seoTitle": "EU ENISA Vulnerability Database (EUVD) — KEV, CVSS & NIS2",
    "seoDescription": "Query the official EU Agency for Cybersecurity (ENISA) European Vulnerability Database (EUVD) for actively exploited vulnerabilities (KEV), critical CVEs, and EPSS.",
    "exampleInput": {
      "modes": [
        "exploited",
        "critical"
      ],
      "maxResults": 25
    },
    "pricing": {
      "pricingModel": "PAY_PER_EVENT",
      "apifyMarginPercentage": 0.2,
      "minimalMaxTotalChargeUsd": 0.05,
      "pricingPerEvent": {
        "actorChargeEvents": {
          "actor-start": {
            "eventTitle": "Actor start",
            "eventDescription": "Flat fee for starting an Actor run.",
            "eventPriceUsd": 0.01,
            "isOneTimeEvent": true
          },
          "vulnerability-record": {
            "eventTitle": "ENISA EUVD vulnerability or advisory record",
            "eventDescription": "Each normalized ENISA EUVD vulnerability record written to the dataset ($2.00 per 1,000 records).",
            "eventPriceUsd": 0.002,
            "isPrimaryEvent": true,
            "isOneTimeEvent": false
          }
        }
      }
    }
  }
};
