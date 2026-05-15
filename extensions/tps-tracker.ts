/**
 * TPS Tracker
 *
 * Tracks tokens per second during model generation.
 * Shows a "⏱ generating..." indicator while streaming,
 * then reports final tokens + tok/s at the end.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let streamStart: number | null = null;

  let totalTokens = 0;
  let totalStreamMs = 0;
  let lastMessageEndTs = 0;

  function reset() {
    streamStart = null;
  }

  pi.on("agent_start", async (_event, ctx) => {
    totalTokens = 0;
    totalStreamMs = 0;
    reset();
    ctx.ui.setStatus("tps", ctx.ui.theme.fg("dim", "⏱ generating..."));
  });

  pi.on("message_start", async (event) => {
    if (event.message.role !== "assistant") return;
    reset();
  });

  pi.on("message_update", async (event) => {
    if (event.message.role !== "assistant") return;

    const ev = event.assistantMessageEvent;
    if (ev.type !== "text_delta" && ev.type !== "thinking_delta" && ev.type !== "toolcall_delta") return;

    const now = Date.now();
    streamStart ??= now;

  });

  pi.on("message_end", async (event) => {
    if (event.message.role !== "assistant") return;

    // Guard against duplicate firings on reload boundaries
    const now = Date.now();
    if (now - lastMessageEndTs < 200) return;
    lastMessageEndTs = now;

    const msgTokens = event.message.usage?.output ?? 0;
    const start = streamStart;

    if (!start || msgTokens <= 0) {
      reset();
      return;
    }

    totalTokens += msgTokens;
    totalStreamMs += Math.max(0, now - start);
    reset();
  });

  pi.on("agent_end", async (_event, ctx) => {
    const elapsed = totalStreamMs / 1000;
    const tps = totalTokens > 0 && elapsed > 0 ? Math.round(totalTokens / elapsed) : 0;

    const theme = ctx.ui.theme;
    const tpsLabel = tps > 0
      ? theme.fg("accent", `${tps} tok/s`)
      : theme.fg("dim", "N/A");

    ctx.ui.setStatus("tps", theme.fg("dim", `done — ${totalTokens} tokens (${tpsLabel})`));
  });
}
