/**
 * Flow Title – Hot Pink / Flashy Orange Edition
 *
 * Shows an animated gradient-sweep "PI" ASCII header on session start.
 * When the user sends a prompt (or on reload), the animation freezes —
 * the header stays visible as a static gradient instead of being removed.
 *
 * Commands:
 *   /flow-title          – Re-enable the animated header mid-session.
 *   /flow-title-reset    – Remove the custom header early.
 */

import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

type Rgb = [number, number, number];

// Hot pinks
const HOT_PINK: Rgb     = [255,  20, 147];
const DEEP_PINK: Rgb    = [255, 105, 180];
const LIGHT_PINK: Rgb   = [255, 182, 193];
const ROSE: Rgb         = [255,   0, 128];
const NEON_PINK: Rgb    = [255,  51, 153];
const MAGENTA: Rgb      = [255,   0, 170];

const ORANGE: Rgb       = [255, 165,   0];
const DARK_ORANGE: Rgb  = [255, 140,   0];
const ORANGE_RED: Rgb   = [255,  69,   0];
const CORAL: Rgb        = [255, 127,  80];
const TANGERINE: Rgb    = [255, 153,  51];
const PUMPKIN: Rgb      = [255, 117,  24];

const PALETTES: Rgb[][] = [
  [DEEP_PINK, HOT_PINK, LIGHT_PINK, HOT_PINK],              // PINK_PALETTE
  [DARK_ORANGE, ORANGE, CORAL, ORANGE],                      // ORANGE_PALETTE
  [HOT_PINK, LIGHT_PINK, ORANGE, CORAL],                     // PINK_ORANGE
  [ROSE, NEON_PINK, MAGENTA, HOT_PINK],                      // NEON_BLAST
  [DEEP_PINK, HOT_PINK, ORANGE_RED, ORANGE],                 // SUNSET
  [ORANGE_RED, CORAL, ORANGE, PUMPKIN],                      // FIERY
  [MAGENTA, HOT_PINK, TANGERINE, ORANGE],                    // TROPICAL
  [LIGHT_PINK, HOT_PINK, CORAL, DARK_ORANGE],                // FLAMINGO
];

function mix(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function sampleGradient(palette: Rgb[], position: number): Rgb {
  const wrapped = ((position % 1) + 1) % 1;
  const scaled = wrapped * palette.length;
  const index = Math.floor(scaled);
  const nextIndex = (index + 1) % palette.length;
  const t = scaled - index;
  const a = palette[index]!;
  const b = palette[nextIndex]!;
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)] as Rgb;
}

function fg([r, g, b]: Rgb, text: string) {
  return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}

/**
 * Colour each character of `text` by its position along a gradient,
 * with a global `phase` offset that sweeps for animation.
 */
function gradientText(palette: Rgb[], text: string, phase: number) {
  const chars = [...text];
  const span = Math.max(chars.length - 1, 1);
  return chars
    .map((char, index) => {
      if (char === " ") return char;
      return fg(sampleGradient(palette, index / span + phase), char);
    })
    .join("");
}

function center(text: string, width: number) {
  const length = [...text].length;
  if (length >= width) return text;
  return `${" ".repeat(Math.floor((width - length) / 2))}${text}`;
}

function projectName(): string {
  return path.basename(process.cwd()) || "session";
}

const TITLE_LINES = [
  "  ██████╗  ██╗ ",
  "  ██╔══██╗ ██║ ",
  "  ██████╔╝ ██║ ",
  "  ██╔═══╝  ██║ ",
  "  ██║      ██║ ",
  "  ╚═╝      ╚═╝ ",
];

/**
 * Render the full header using a chosen palette with a phase offset.
 * Each line gets a slight row offset so the sweep cascades.
 */
function renderHeader(
  palette: Rgb[],
  width: number,
  phase: number,
  subtitleText: string,
): string[] {
  const lines = TITLE_LINES.map((line, row) =>
    gradientText(palette, center(line, width), phase + row * 0.045),
  );
  const subtitle = center(subtitleText, width);
  return [
    "",
    ...lines,
    `${BOLD}${gradientText(palette, subtitle, phase + 0.18)}${RESET}`,
    "",
  ];
}

export default function (pi: ExtensionAPI) {
  let currentModelId = "no model selected";
  let isDeepSeekModel = false;
  let animTimer: ReturnType<typeof setInterval> | null = null;
  let dismissed = false;
  let tuiRef: { requestRender: () => void } | null = null;
  let currentPhase = 0;
  let currentPalette: Rgb[] = PALETTES[0]!;

  function stopAnimation() {
    if (animTimer !== null) {
      clearInterval(animTimer);
      animTimer = null;
    }
  }

  function freeze() {
    stopAnimation();
    // Header stays — just no longer animating (static snapshot).
  }

  function dismiss(ctx: ExtensionContext) {
    if (dismissed) return;
    dismissed = true;
    stopAnimation();
    if (ctx.hasUI) ctx.ui.setHeader(undefined);
  }

  function installHeader(ctx: ExtensionContext, static_: boolean = false) {
    dismissed = false;
    stopAnimation();
    currentPhase = 0;
    currentPalette = PALETTES[Math.floor(Math.random() * PALETTES.length)]!;

    if (!static_) {
      animTimer = setInterval(() => {
        currentPhase = (currentPhase + 0.04) % 1;
        tuiRef?.requestRender();
      }, 166);
    }

    ctx.ui.setHeader((tui, _theme) => {
      tuiRef = tui;
      return {
        render(width: number) {
          const sep = " · ";
          const prefix = isDeepSeekModel ? "🐋 " : "";
          return renderHeader(
            currentPalette,
            width,
            currentPhase,
            `${prefix}${currentModelId}${sep}${projectName()}`,
          );
        },
        invalidate() {},
        dispose() {
          stopAnimation();
        },
      };
    });
  }

  pi.on("session_start", (event, ctx) => {
    currentModelId = ctx.model?.id ?? "no model selected";
    isDeepSeekModel = currentModelId.toLowerCase().includes("deepseek");
    dismissed = false;
    if (!ctx.hasUI) return;
    if (event.reason === "reload") {
      installHeader(ctx, true); // static on reload
      return;
    }
    installHeader(ctx);
  });

  pi.on("model_select", (event) => {
    currentModelId = event.model.id;
    isDeepSeekModel = currentModelId.toLowerCase().includes("deepseek");
  });

  /** When the user sends a prompt, freeze the animation (keep static). */
  pi.on("agent_start", (_event, _ctx) => {
    freeze();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    stopAnimation();
    if (ctx.hasUI) ctx.ui.setHeader(undefined);
  });

  pi.registerCommand("flow-title", {
    description: "Re-enable the animated flowing gradient header",
    handler: async (_args, ctx) => {
      installHeader(ctx);
      ctx.ui.notify("🎨 Flow title enabled", "info");
    },
  });

  pi.registerCommand("flow-title-reset", {
    description: "Remove the custom header and restore pi's built-in header",
    handler: async (_args, ctx) => {
      dismiss(ctx);
      ctx.ui.notify("Built-in header restored", "info");
    },
  });
}
