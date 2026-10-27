#!/usr/bin/env node
// Stdio MCP server for EU Consolidated Financial Sanctions List (DG FISMA / FSF) screening.
// Every response (including error responses) carries:
//   - attribution (from licences.json `eu_sanctions` with fileGenerationDate)
//   - listPublicationDate & fileGenerationDate
//   - "not legal advice" disclaimer
//   - fuzzy matches clearly labeled "possible match" (never determinations)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  loadSanctionsList,
  screenBatch,
  lookupEntities,
  complianceEnvelope,
} from './lib/sanctions.js';

export function sanctionsJsonResult(fileGenerationDate, payload) {
  const env = complianceEnvelope(fileGenerationDate);
  const body = { ...payload, ...env };
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
  };
}

export function sanctionsErrorResult(fileGenerationDate, err) {
  const env = complianceEnvelope(fileGenerationDate);
  const body = {
    error: err instanceof Error ? err.message : String(err),
    ...env,
  };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
  };
}

export function buildServer(loaderOpts = {}) {
  const srv = new McpServer({ name: 'eu-sanctions-screen', version: '0.1.0' });

  srv.tool(
    'eu_sanctions_screen',
    'Screen one or more person/company names, EU reference numbers, or identification numbers against the official EU Consolidated Financial Sanctions List (DG FISMA / FSF). Fuzzy matches are labeled "possible match" (not determinations). Every response includes list publication date, source attribution, and a not-legal-advice disclaimer.',
    {
      queries: z.array(z.string()).min(1).max(200).describe('Names, companies, EU reference numbers (e.g. EU.27.28), or document/registration numbers to screen'),
      subjectType: z.enum(['all', 'person', 'enterprise']).default('all'),
      programmes: z.array(z.string()).optional().describe('Optional EU sanctions programme codes (e.g. RUS, BLR, IRN, SYR, IRQ)'),
      country: z.string().optional().describe('Optional 2-letter ISO country code filter'),
      fuzzyThreshold: z.number().min(0.5).max(1.0).default(0.78).describe('Minimum similarity [0.5..1.0] to report a non-exact match as a "possible match"'),
      maxMatchesPerQuery: z.number().int().min(1).max(25).default(5),
    },
    async ({ queries, subjectType, programmes, country, fuzzyThreshold, maxMatchesPerQuery }) => {
      let genDate = 'unknown';
      try {
        const index = await loadSanctionsList(loaderOpts);
        genDate = index.fileGenerationDate;
        const batch = screenBatch(index, queries, {
          subjectType,
          programmes,
          country,
          fuzzyThreshold,
          maxMatches: maxMatchesPerQuery,
          includeClearQueries: true,
        });
        return sanctionsJsonResult(genDate, {
          totalScreened: batch.totalScreened,
          queriesWithExactMatch: batch.queriesWithExactMatch,
          queriesWithPossibleMatch: batch.queriesWithPossibleMatch,
          queriesClear: batch.queriesClear,
          results: batch.results,
        });
      } catch (e) {
        return sanctionsErrorResult(genDate, e);
      }
    }
  );

  srv.tool(
    'eu_sanctions_lookup',
    'Look up sanctioned entities in the official EU Consolidated Financial Sanctions List by EU reference number (e.g. EU.27.28), logical ID, programme (e.g. RUS, IRQ, IRN), subject type, or ISO-2 country code.',
    {
      euReferenceNumber: z.string().optional(),
      logicalId: z.string().optional(),
      programme: z.string().optional(),
      subjectType: z.enum(['all', 'person', 'enterprise']).default('all'),
      country: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async (args) => {
      let genDate = 'unknown';
      try {
        const index = await loadSanctionsList(loaderOpts);
        genDate = index.fileGenerationDate;
        const res = lookupEntities(index, args);
        return sanctionsJsonResult(genDate, res);
      } catch (e) {
        return sanctionsErrorResult(genDate, e);
      }
    }
  );

  srv.tool(
    'eu_sanctions_list_info',
    'Return publication metadata, entity counts (persons vs enterprises), and active sanctions programme codes for the currently loaded EU Consolidated Financial Sanctions List.',
    {},
    async () => {
      let genDate = 'unknown';
      try {
        const index = await loadSanctionsList(loaderOpts);
        genDate = index.fileGenerationDate;
        let persons = 0;
        let enterprises = 0;
        for (const e of index.entities) {
          if (e.subjectType === 'person') persons++;
          else if (e.subjectType === 'enterprise') enterprises++;
        }
        return sanctionsJsonResult(genDate, {
          totalEntities: index.totalEntities,
          persons,
          enterprises,
          other: index.totalEntities - persons - enterprises,
          programmes: index.programmes,
        });
      } catch (e) {
        return sanctionsErrorResult(genDate, e);
      }
    }
  );

  return srv;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildServer().connect(new StdioServerTransport());
}
