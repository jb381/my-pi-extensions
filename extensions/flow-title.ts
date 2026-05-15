/**
 * Flow Title – Hot Pink / Flashy Orange Edition
 *
 * Shows an animated gradient-sweep "PI" ASCII header on session start.
 * Automatically removes itself on the first user prompt to stay out of the way.
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
const HOT_PINK: Rgb = [255, 20, 147];
const DEEP_PINK: Rgb = [255, 105, 180];
const LIGHT_PINK: Rgb = [255, 182, 193];
const ROSE: Rgb = [255, 0, 128];
const NEON_PINK: Rgb = [255, 51, 153];
const MAGENTA: Rgb = [255, 0, 170];

const ORANGE: Rgb = [255, 165, 0];
const DARK_ORANGE: Rgb = [255, 140, 0];
const ORANGE_RED: Rgb = [255, 69, 0];
const CORAL: Rgb = [255, 127, 80];
const TANGERINE: Rgb = [255, 153, 51];
const PUMPKIN: Rgb = [255, 117, 24];

const PINK_PALETTE: Rgb[] = [DEEP_PINK, HOT_PINK, LIGHT_PINK, HOT_PINK];
const ORANGE_PALETTE: Rgb[] = [DARK_ORANGE, ORANGE, CORAL, ORANGE];
const PINK_ORANGE: Rgb[] = [HOT_PINK, LIGHT_PINK, ORANGE, CORAL];
const NEON_BLAST: Rgb[] = [ROSE, NEON_PINK, MAGENTA, HOT_PINK];
const SUNSET: Rgb[] = [DEEP_PINK, HOT_PINK, ORANGE_RED, ORANGE];
const FIERY: Rgb[] = [ORANGE_RED, CORAL, ORANGE, PUMPKIN];
const TROPICAL: Rgb[] = [MAGENTA, HOT_PINK, TANGERINE, ORANGE];
const FLAMINGO: Rgb[] = [LIGHT_PINK, HOT_PINK, CORAL, DARK_ORANGE];

const PALETTES: Rgb[][] = [
  PINK_PALETTE,
  ORANGE_PALETTE,
  PINK_ORANGE,
  NEON_BLAST,
  SUNSET,
  FIERY,
  TROPICAL,
  FLAMINGO,
];

const PALETTE: Rgb[] = PALETTES[Math.floor(Math.random() * PALETTES.length)];

const TITLE_LINES = [
  "  ██████╗  ██╗ ",
  "  ██╔══██╗ ██║ ",
  "  ██████╔╝ ██║ ",
  "  ██╔═══╝  ██║ ",
  "  ██║      ██║ ",
  "  ╚═╝      ╚═╝ ",
];

function mix(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

/** Interpolate a colour from the palette at position `position` in [0,1). */
function sampleGradient(position: number): Rgb {
  const wrapped = ((position % 1) + 1) % 1;
  const scaled = wrapped * PALETTE.length;
  const index = Math.floor(scaled);
  const nextIndex = (index + 1) % PALETTE.length;
  const t = scaled - index;
  const a = PALETTE[index]!;
  const b = PALETTE[nextIndex]!;
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)] as Rgb;
}

/** Wrap `text` in an ANSI 24-bit foreground colour escape. */
function fg([r, g, b]: Rgb, text: string) {
  return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;
}

/** Colour each character of `text` by its position along a gradient + a global phase offset. */
function gradientText(text: string, phase: number) {
  const chars = [...text];
  const span = Math.max(chars.length - 1, 1);
  return chars
    .map((char, index) => {
      if (char === " ") return char;
      return fg(sampleGradient(index / span + phase), char);
    })
    .join("");
}

/** Centre `text` in `width` columns (respects Unicode width). */
function center(text: string, width: number) {
  const length = [...text].length;
  if (length >= width) return text;
  return `${" ".repeat(Math.floor((width - length) / 2))}${text}`;
}

/** Return the basename of the current working directory. */
function projectName(): string {
  return path.basename(process.cwd()) || "session";
}

function renderHeader(width: number, phase: number, subtitleText: string) {
  const lines = TITLE_LINES.map((line, row) =>
    gradientText(center(line, width), phase + row * 0.045),
  );
  const subtitle = center(subtitleText, width);
  return [
    "",
    ...lines,
    `${BOLD}${gradientText(subtitle, phase + 0.18)}${RESET}`,
    "",
  ];
}

export default function (pi: ExtensionAPI) {
  let currentModelId = "no model selected";
  let isDeepSeekModel = false;
  let animTimer: ReturnType<typeof setInterval> | null = null;
  let dismissed = false;
  let tuiRef: { requestRender: () => void } | null = null;

  function stopAnimation() {
    if (animTimer !== null) {
      clearInterval(animTimer);
      animTimer = null;
    }
  }

  /** Tear down the header and animation for good. */
  function dismiss(ctx: ExtensionContext) {
    if (dismissed) return;
    dismissed = true;
    stopAnimation();
    if (ctx.hasUI) ctx.ui.setHeader(undefined);
  }

  function installHeader(ctx: ExtensionContext) {
    dismissed = false;
    stopAnimation();

    let phase = 0;

    animTimer = setInterval(() => {
      phase = (phase + 0.04) % 1;
      tuiRef?.requestRender();
    }, 166);

    ctx.ui.setHeader((tui, _theme) => {
      tuiRef = tui;
      return {
        render(width: number) {
          const sep = " · ";
          const prefix = isDeepSeekModel ? "🐋 " : "";
          return renderHeader(width, phase, `${prefix}${currentModelId}${sep}${projectName()}`);
        },
        invalidate() {},
        dispose() {
          stopAnimation();
        },
      };
    });
  }

  pi.on("session_start", (_event, ctx) => {
    currentModelId = ctx.model?.id ?? "no model selected";
    isDeepSeekModel = currentModelId.toLowerCase().includes("deepseek");
    dismissed = false;
    if (!ctx.hasUI) return;
    installHeader(ctx);
  });

  pi.on("model_select", (event) => {
    currentModelId = event.model.id;
    isDeepSeekModel = currentModelId.toLowerCase().includes("deepseek");
  });

  /** First user prompt → header goes away. */
  pi.on("agent_start", (_event, ctx) => {
    dismiss(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    stopAnimation();
    if (ctx.hasUI) ctx.ui.setHeader(undefined);
  });

  pi.registerCommand("flow-title", {
    description: "Re-enable the hot pink / flashy orange flowing gradient header",
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
