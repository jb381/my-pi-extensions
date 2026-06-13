/**
 * Usage – Professional-grade Pi session usage & cost report.
 *
 * Scans all Pi session JSONL files, aggregates token usage and cost
 * by model/provider, and presents clean Markdown tables for the
 * last 1, 7, 30, and 90 days — all computed in TypeScript, not by
 * burning LLM context.
 *
 * Uses the cost data that pi already tracks per-message, so no
 * external pricing API needed.
 *
 * Commands:
 *   /usage             Full report (1, 7, 30, 90 day windows)
 *   /usage 1           Just the last 24 hours
 *   /usage 7 30        Custom window selection
 *   /usage --json      Raw JSON output (for piping to other tools)
 *
 * TUI status widget shows aggregate running totals.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync, globSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UsageData {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

interface AssistantMessage {
  model: string;
  provider: string;
  timestamp: number; // ms epoch
  usage: UsageData;
}

interface ModelRow {
  provider: string;
  model: string;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
}

interface WindowReport {
  label: string;
  days: number;
  rows: ModelRow[];
  totals: ModelRow;
  generatedAt: string;
}

interface FullReport {
  generatedAt: string;
  sessionFilesScanned: number;
  totalAssistantMessages: number;
  skippedFiles: number;
  malformedLines: number;
  windows: WindowReport[];
  grandTotal: {
    messages: number;
    tokens: number;
    cost: number;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SESSION_DIR = join(homedir(), ".pi", "agent", "sessions");

const WINDOWS = [
  { label: "Last 1 day", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
] as const;

// ─── Session Parsing ─────────────────────────────────────────────────────────

function findSessionFiles(): string[] {
  try {
    return globSync(join(SESSION_DIR, "**/*.jsonl"));
  } catch {
    return [];
  }
}

function parseUsage(cost: unknown): UsageData["cost"] {
  if (!cost || typeof cost !== "object") {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  }
  const c = cost as Record<string, unknown>;
  return {
    input: safeNum(c.input),
    output: safeNum(c.output),
    cacheRead: safeNum(c.cacheRead),
    cacheWrite: safeNum(c.cacheWrite),
    total: safeNum(c.total),
  };
}

function parseUsageData(raw: unknown): UsageData | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const totalTokens = safeNum(u.totalTokens);
  if (totalTokens <= 0) return null;
  return {
    input: safeNum(u.input),
    output: safeNum(u.output),
    cacheRead: safeNum(u.cacheRead),
    cacheWrite: safeNum(u.cacheWrite),
    totalTokens,
    cost: parseUsage(u.cost),
  };
}

function safeNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return !Number.isNaN(n) ? n : fallback;
  }
  return fallback;
}

function parseSessionFile(filePath: string): { messages: AssistantMessage[]; malformedLines: number } {
  const results: AssistantMessage[] = [];
  let malformedLines = 0;
  const text = readFileSync(filePath, "utf8");

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      malformedLines++;
      continue;
    }

    if (parsed.type !== "message") continue;

    const msg = parsed.message;
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;

    if (m.role !== "assistant") continue;

    const usage = parseUsageData(m.usage);
    if (!usage) continue;

    const model = typeof m.model === "string" && m.model.trim() ? m.model.trim() : "unknown";
    const provider = typeof m.provider === "string" && m.provider.trim() ? m.provider.trim() : "unknown";
    const timestamp = safeNum(m.timestamp, Date.now());

    results.push({ model, provider, timestamp, usage });
  }

  return { messages: results, malformedLines };
}

function parseAllSessions(): { messages: AssistantMessage[]; filesScanned: number; skippedFiles: number; malformedLines: number } {
  const files = findSessionFiles();
  const all: AssistantMessage[] = [];
  let skipped = 0;
  let malformedLines = 0;

  for (const file of files) {
    try {
      const result = parseSessionFile(file);
      all.push(...result.messages);
      malformedLines += result.malformedLines;
    } catch {
      skipped++;
    }
  }

  return { messages: all, filesScanned: files.length, skippedFiles: skipped, malformedLines };
}

// ─── Report Generation ───────────────────────────────────────────────────────

function inWindow(timestamp: number, days: number): boolean {
  const cutoff = Date.now() - days * 86_400_000;
  return timestamp >= cutoff;
}

function buildWindow(messages: AssistantMessage[], label: string, days: number): WindowReport {
  const modelMap = new Map<string, ModelRow>();

  for (const msg of messages) {
    if (!inWindow(msg.timestamp, days)) continue;

    const key = `${msg.provider}\x00${msg.model}`;
    const existing = modelMap.get(key);

    if (existing) {
      existing.messages += 1;
      existing.inputTokens += msg.usage.input;
      existing.outputTokens += msg.usage.output;
      existing.cacheReadTokens += msg.usage.cacheRead;
      existing.cacheWriteTokens += msg.usage.cacheWrite;
      existing.totalTokens += msg.usage.totalTokens;
      existing.cost += msg.usage.cost.total;
    } else {
      modelMap.set(key, {
        provider: msg.provider,
        model: msg.model,
        messages: 1,
        inputTokens: msg.usage.input,
        outputTokens: msg.usage.output,
        cacheReadTokens: msg.usage.cacheRead,
        cacheWriteTokens: msg.usage.cacheWrite,
        totalTokens: msg.usage.totalTokens,
        cost: msg.usage.cost.total,
      });
    }
  }

  const rows = Array.from(modelMap.values()).sort((a, b) => b.cost - a.cost);
  const totals: ModelRow = {
    provider: "",
    model: "TOTAL",
    messages: rows.reduce((s, r) => s + r.messages, 0),
    inputTokens: rows.reduce((s, r) => s + r.inputTokens, 0),
    outputTokens: rows.reduce((s, r) => s + r.outputTokens, 0),
    cacheReadTokens: rows.reduce((s, r) => s + r.cacheReadTokens, 0),
    cacheWriteTokens: rows.reduce((s, r) => s + r.cacheWriteTokens, 0),
    totalTokens: rows.reduce((s, r) => s + r.totalTokens, 0),
    cost: rows.reduce((s, r) => s + r.cost, 0),
  };

  return {
    label,
    days,
    rows,
    totals,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n > 0) return `$${n.toFixed(6)}`;
  return "$0.00";
}

function formatMarkdownTable(window: WindowReport): string {
  const { label, rows, totals } = window;
  const lines: string[] = [];
  const modelWidth = Math.max(
    ...rows.map((r) => `${r.provider}/${r.model}`.length),
    10,
  );
  const colWidth = 14;

  const header = `| ${"Model".padEnd(modelWidth)} | ${"Messages".padStart(8)} | ${"Input".padStart(colWidth)} | ${"Output".padStart(colWidth)} | ${"Cached".padStart(colWidth)} | ${"Total".padStart(colWidth)} | ${"Cost".padStart(10)} |`;
  const sep = `| :${"-".repeat(Math.max(modelWidth - 1, 2))} | ${"---:".padStart(8)} | ${"---:".padStart(colWidth)} | ${"---:".padStart(colWidth)} | ${"---:".padStart(colWidth)} | ${"---:".padStart(colWidth)} | ${"---:".padStart(10)} |`;

  lines.push(`### ${label}`);
  lines.push("");
  lines.push(header);
  lines.push(sep);

  for (const row of rows) {
    const modelLabel = `${row.provider}/${row.model}`;
    lines.push(
      `| ${modelLabel.padEnd(modelWidth)} ` +
      `| ${String(row.messages).padStart(8)} ` +
      `| ${fmtTokens(row.inputTokens).padStart(colWidth)} ` +
      `| ${fmtTokens(row.outputTokens).padStart(colWidth)} ` +
      `| ${fmtTokens(row.cacheReadTokens).padStart(colWidth)} ` +
      `| ${fmtTokens(row.totalTokens).padStart(colWidth)} ` +
      `| ${fmtCost(row.cost).padStart(10)} |`,
    );
  }

  // Total row — plain text for numbers (markdown bold breaks with padding spaces)
  lines.push(
    `| ${"TOTAL".padEnd(modelWidth)} ` +
    `| ${String(totals.messages).padStart(8)} ` +
    `| ${fmtTokens(totals.inputTokens).padStart(colWidth)} ` +
    `| ${fmtTokens(totals.outputTokens).padStart(colWidth)} ` +
    `| ${fmtTokens(totals.cacheReadTokens).padStart(colWidth)} ` +
    `| ${fmtTokens(totals.totalTokens).padStart(colWidth)} ` +
    `| ${fmtCost(totals.cost).padStart(10)} |`,
  );

  lines.push("");
  return lines.join("\n");
}

function formatFullReport(report: FullReport): string {
  const lines: string[] = [
    "# 📊 Pi Usage Report",
    "",
    `**Generated:** ${new Date(report.generatedAt).toLocaleString()}`,
    `**Session files scanned:** ${report.sessionFilesScanned}`,
    `**Assistant messages parsed:** ${fmtNum(report.totalAssistantMessages)}`,
  ];

  if (report.skippedFiles > 0) {
    lines.push(`**Files skipped (errors):** ${report.skippedFiles}`);
  }
  if (report.malformedLines > 0) {
    lines.push(`**Malformed JSON lines:** ${report.malformedLines}`);
  }

  lines.push("", "---", "");

  for (const window of report.windows) {
    lines.push(formatMarkdownTable(window));
  }

  // Grand total summary
  const { grandTotal } = report;
  lines.push(
    "---",
    "",
    "### 📈 All-Time Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| **Total messages** | ${fmtNum(grandTotal.messages)} |`,
    `| **Total tokens** | ${fmtNum(grandTotal.tokens)} |`,
    `| **Total cost** | ${fmtCost(grandTotal.cost)} |`,
    "",
    "---",
    "",
    "> **Note:** Costs are from pi's per-message tracking. Models served via Ollama",
    "> or other local providers may show $0 if pi doesn't have pricing data for them.",
    "> Run inside pi to use this command — data is parsed from session files locally.",
  );

  return lines.join("\n");
}

// ─── Main Logic ──────────────────────────────────────────────────────────────

function generateReport(messages: AssistantMessage[], filesScanned: number, skippedFiles: number, malformedLines: number): FullReport {
  const windows = WINDOWS.map((w) => buildWindow(messages, w.label, w.days));

  return {
    generatedAt: new Date().toISOString(),
    sessionFilesScanned: filesScanned,
    totalAssistantMessages: messages.length,
    skippedFiles,
    malformedLines,
    windows,
    grandTotal: {
      messages: messages.length,
      tokens: messages.reduce((s, m) => s + m.usage.totalTokens, 0),
      cost: messages.reduce((s, m) => s + m.usage.cost.total, 0),
    },
  };
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Cached report data so we don't re-parse on every interaction
  let cachedReport: FullReport | null = null;

  function buildReport(_ctx: ExtensionContext): FullReport {
    const { messages, filesScanned, skippedFiles, malformedLines } = parseAllSessions();
    const report = generateReport(messages, filesScanned, skippedFiles, malformedLines);
    cachedReport = report;
    return report;
  }

  // ─── Register command: /usage ────────────────────────────────────────────

  pi.registerCommand("usage", {
    description: "Generate a Pi usage & cost report (1, 7, 30, 90 days)",
    getArgumentCompletions: (prefix: string) => {
      const cmds = ["--json", "--refresh", "1", "7", "30", "90"];
      const filtered = cmds
        .filter((c) => c.startsWith(prefix))
        .map((c) => ({ value: c, label: c }));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const lower = trimmed.toLowerCase();

      // Parse requested windows
      const dayArgs = trimmed
        .split(/\s+/)
        .filter((s) => /^\d+$/.test(s))
        .map(Number)
        .filter((n) => n > 0);

      const showJson = lower.includes("--json");
      const forceRefresh = lower.includes("--refresh");

      const report = forceRefresh || !cachedReport
        ? buildReport(ctx)
        : cachedReport;

      if (showJson) {
        const json = JSON.stringify(report, null, 2);
        pi.sendMessage(
          {
            customType: "usage-report-json",
            content: `\`\`\`json\n${json}\n\`\`\``,
            display: true,
          },
          { triggerTurn: false },
        );
        return;
      }

      // Filter to requested windows
      if (dayArgs.length > 0) {
        const filteredWindows = report.windows.filter((w) => dayArgs.includes(w.days));
        if (filteredWindows.length === 0) {
          ctx.ui.notify(
            `No data for ${dayArgs.join(", ")} day window(s). Available: 1, 7, 30, 90.`,
            "warning",
          );
          return;
        }

        // Build filtered version inline
        const filteredMsg: string[] = [
          "# 📊 Pi Usage Report (filtered)",
          "",
          `**Generated:** ${new Date(report.generatedAt).toLocaleString()}`,
          `**Windows:** ${filteredWindows.map((w) => w.label).join(", ")}`,
          "",
          "---",
          "",
        ];
        for (const w of filteredWindows) {
          filteredMsg.push(formatMarkdownTable(w));
        }
        pi.sendMessage(
          {
            customType: "usage-report",
            content: filteredMsg.join("\n"),
            display: true,
          },
          { triggerTurn: false },
        );
        return;
      }

      // Full report — just the tables, no persistent UI
      pi.sendMessage(
        {
          customType: "usage-report",
          content: formatFullReport(report),
          display: true,
        },
        { triggerTurn: false },
      );
    },
  });

  // ─── Register tool: generate_usage_report ────────────────────────────────

  pi.registerTool({
    name: "generate_usage_report",
    label: "Generate Usage Report",
    description:
      "Scan Pi session files and generate a usage and cost report. " +
      "Returns data grouped by model/provider for the last 1, 7, 30, and 90 days. " +
      "The LLM can use this to answer questions about token consumption and costs.",
    promptSnippet: "Generate a usage/cost report from Pi session files.",
    promptGuidelines: [
      "Use generate_usage_report when the user asks about their Pi usage, token consumption, or costs.",
      "The tool returns structured data computed locally — no LLM context wasted on file parsing.",
    ],
    parameters: Type.Object({
      format: Type.Optional(
        Type.Enum({ markdown: "markdown", json: "json" } as const, {
          description: "Output format. Default: json (for LLM consumption).",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { messages, filesScanned, skippedFiles, malformedLines } = parseAllSessions();
      const report = generateReport(messages, filesScanned, skippedFiles, malformedLines);
      cachedReport = report;

      if (params.format === "markdown") {
        return {
          content: [{ type: "text", text: formatFullReport(report) }],
          details: report,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        details: report,
      };
    },
  });
}
