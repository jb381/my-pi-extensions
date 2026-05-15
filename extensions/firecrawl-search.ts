/**
 * Firecrawl Search
 *
 * Adds `search` and `scrape` tools for web search and page content extraction
 * via the Firecrawl API (https://www.firecrawl.dev).
 *
 * Setup: set FIRECRAWL_API_KEY in your environment or ~/.pi/agent/.env
 * Free tier: 500 requests/month, no credit card needed.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

function readApiKey(): string {
  // 1. Environment variable
  const fromEnv = process.env.FIRECRAWL_API_KEY;
  if (fromEnv) return fromEnv;

  // 2. ~/.pi/agent/.env
  try {
    const envPath = join(homedir(), ".pi", "agent", ".env");
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^(?:export\s+)?FIRECRAWL_API_KEY\s*=\s*(.*)$/);
      if (!match) continue;
      let val = match[1].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return val.replace(/\s+#.*$/, "");
    }
  } catch {
    // file doesn't exist
  }

  throw new Error(
    "FIRECRAWL_API_KEY not found.\n" +
    "Set it in your environment or add it to ~/.pi/agent/.env:\n" +
    '  FIRECRAWL_API_KEY="your-key-here"\n' +
    "Get a free key at https://www.firecrawl.dev/"
  );
}

function fmtErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Trim a string to `max` chars, appending `...` if truncated. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n… (truncated)";
}

interface FcSearchResultItem {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
}

interface FcSearchData {
  web?: FcSearchResultItem[];
  news?: FcSearchResultItem[];
  images?: FcSearchResultItem[];
}

interface FcSearchRes {
  success: boolean;
  data?: FcSearchData;
  error?: string;
}

interface FcScrapeRes {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

async function fcPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const key = readApiKey();
  const res = await fetch(`${FIRECRAWL_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firecrawl API ${res.status}: ${text || res.statusText}`);
  }

  const json = (await res.json()) as FcSearchRes | FcScrapeRes;
  if (!json.success) {
    throw new Error(`Firecrawl error: ${json.error || "unknown"}`);
  }

  return json as T;
}

/** Format a list of search result items into clean agent-readable text. */
function formatSearchResults(
  query: string,
  items: FcSearchResultItem[] | undefined,
  source: string,
  withContent: boolean,
): string {
  if (!items || items.length === 0) {
    return `No ${source} results found for "${query}".`;
  }

  const lines: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const r = items[i];
    lines.push(`${i + 1}. ${r.title || "(no title)"}`);
    if (r.url) lines.push(`   ${r.url}`);
    if (r.description) lines.push(`   ${r.description}`);

    // Attach scraped content (if asked) — truncated to stay context-friendly
    if (withContent && r.markdown) {
      const md = truncate(r.markdown, 2500);
      lines.push(`   ─── content ───`);
      lines.push(...md.split("\n").map(l => `   ${l}`));
    }
    lines.push("");
  }

  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "search",
    label: "Search Web",
    description:
      "Search the web with Firecrawl. Returns web / news / image results. " +
      "Set scrapeResults: true to also fetch each page's markdown content.",
    promptSnippet: "Search the web with Firecrawl for current information.",
    promptGuidelines: [
      "Use the search tool when the user asks for current web information, docs, or sources beyond the local workspace.",
      "Set scrapeResults: true on the search tool when you need the actual page content, not just snippets.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The search query." }),
      limit: Type.Optional(
        Type.Number({
          description: "Max results (1–20, default 5).",
          minimum: 1,
          maximum: 20,
        }),
      ),
      source: Type.Optional(StringEnum(["web", "news", "images"] as const)),
      scrapeResults: Type.Optional(
        Type.Boolean({
          description: "Scrape each result into markdown. Default false.",
        }),
      ),
    }),
    async execute(_id, params, signal, onUpdate, _ctx) {
      try {
        onUpdate?.({ content: [{ type: "text", text: `🔍 Searching: ${params.query}` }], details: undefined });

        const source = params.source ?? "web";

        const res = await fcPost<FcSearchRes>("/search", {
          query: params.query,
          limit: params.limit ?? 5,
          sources: [source],
          scrapeOptions: params.scrapeResults
            ? { formats: ["markdown"], onlyMainContent: true, timeout: 30000 }
            : undefined,
          timeout: 30000,
        }, signal);

        if (signal?.aborted) throw new Error("Search cancelled");

        // v2 returns data grouped by source type — pick the right array
        const items = res.data?.[source as keyof FcSearchData];

        const text = formatSearchResults(
          params.query,
          items,
          source,
          params.scrapeResults ?? false,
        );

        return {
          content: [{ type: "text", text }],
          details: res,
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Search failed: ${fmtErr(err)}` }],
          details: {},
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "scrape",
    label: "Scrape Page",
    description:
      "Fetch a single URL and return its content as clean markdown. " +
      "Prefer this over bash/curl for web pages — Firecrawl strips ads/nav and returns readable text.",
    promptSnippet: "Fetch a URL's content as markdown with Firecrawl.",
    promptGuidelines: [
      "Use the scrape tool when you need the full readable content of a known URL.",
      "Prefer the scrape tool over bash/fetch for web pages — it returns cleaned markdown.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch." }),
      onlyMainContent: Type.Optional(
        Type.Boolean({ description: "Only return main content. Default true." }),
      ),
      timeout: Type.Optional(
        Type.Number({ description: "Timeout in ms. Default 30000." }),
      ),
      includeMetadata: Type.Optional(
        Type.Boolean({ description: "Append page metadata. Default false." }),
      ),
    }),
    async execute(_id, params, signal, onUpdate, _ctx) {
      try {
        onUpdate?.({ content: [{ type: "text", text: `📄 Scraping: ${params.url}` }], details: undefined });

        const res = await fcPost<FcScrapeRes>("/scrape", {
          url: params.url,
          formats: ["markdown"],
          onlyMainContent: params.onlyMainContent ?? true,
          timeout: params.timeout ?? 30000,
        }, signal);

        if (signal?.aborted) throw new Error("Scrape cancelled");

        let text = res.data?.markdown?.trim() || "(no content)";

        if (params.includeMetadata && res.data?.metadata) {
          text += `\n\n---\nMetadata:\n${JSON.stringify(res.data.metadata, null, 2)}`;
        }

        return {
          content: [{ type: "text", text }],
          details: res,
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Scrape failed: ${fmtErr(err)}` }],
          details: {},
          isError: true,
        };
      }
    },
  });
}
