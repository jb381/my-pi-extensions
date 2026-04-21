import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import codexLimitExtension from "./codex-limit";

type RepoExtensionSelection = {
	disabled: string[];
};

type RepoExtensionInfo = {
	id: string;
	label: string;
	description: string;
	load: (pi: ExtensionAPI) => void | Promise<void>;
};

const EXTENSION_DIR = __dirname;
const SELECTION_DIR = join(getAgentDir(), "extensions");
const SELECTION_FILE = join(SELECTION_DIR, "my-pi-extensions.json");

/**
 * Repo-local extension catalog.
 *
 * Keeping this explicit is a little less magical than filesystem discovery,
 * but it is safer, easier to review, and more reliable with pi's TS runtime.
 */
const EXTENSIONS: RepoExtensionInfo[] = [
	{
		id: "codex-limit",
		label: "codex-limit",
		description: "Interactive Codex rate-limit lookup via /codex-limit",
		load: codexLimitExtension,
	},
];

function findUnregisteredExtensionFiles(): string[] {
	return readdirSync(EXTENSION_DIR, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && entry.name !== "extension-manager.ts")
		.map((entry) => basename(entry.name, ".ts"))
		.filter((id) => !EXTENSIONS.some((extension) => extension.id === id))
		.sort();
}

function normalizeDisabled(values: unknown): string[] {
	if (!Array.isArray(values)) return [];
	return Array.from(
		new Set(
			values
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter(Boolean),
		),
	).sort();
}

function loadSelection(): RepoExtensionSelection {
	if (!existsSync(SELECTION_FILE)) return { disabled: [] };

	try {
		const raw = readFileSync(SELECTION_FILE, "utf8");
		const parsed = JSON.parse(raw) as Partial<RepoExtensionSelection> | undefined;
		return { disabled: normalizeDisabled(parsed?.disabled) };
	} catch {
		return { disabled: [] };
	}
}

function saveSelection(selection: RepoExtensionSelection): void {
	mkdirSync(SELECTION_DIR, { recursive: true });
	writeFileSync(SELECTION_FILE, `${JSON.stringify({ disabled: normalizeDisabled(selection.disabled) }, null, 2)}\n`, "utf8");
}

function getEnabledExtensions(selection: RepoExtensionSelection): RepoExtensionInfo[] {
	const disabled = new Set(selection.disabled);
	return EXTENSIONS.filter((extension) => !disabled.has(extension.id));
}

function formatSelectionSummary(selection: RepoExtensionSelection): string {
	return `${getEnabledExtensions(selection).length}/${EXTENSIONS.length} enabled`;
}

function formatEnabledList(selection: RepoExtensionSelection): string {
	const enabled = getEnabledExtensions(selection);
	return enabled.length > 0 ? enabled.map((extension) => extension.id).join(", ") : "none";
}

export default async function repoExtensionManager(pi: ExtensionAPI): Promise<void> {
	for (const extension of getEnabledExtensions(loadSelection())) {
		await extension.load(pi);
	}

	pi.registerCommand("extensions", {
		description: "Enable or disable repo extensions",
		handler: async (_args, ctx) => {
			if (EXTENSIONS.length === 0) {
				ctx.ui.notify("No repo extensions are configured.", "warning");
				return;
			}

			if (!ctx.hasUI) {
				const selection = loadSelection();
				ctx.ui.notify(
					`Enabled repo extensions: ${formatEnabledList(selection)} (${formatSelectionSummary(selection)})`,
					"info",
				);
				return;
			}

			const selection = loadSelection();
			const unregistered = findUnregisteredExtensionFiles();
			const disabled = new Set(selection.disabled);
			let selected = 0;
			let scroll = 0;
			let applied = false;
			const visibleRows = Math.max(4, Math.min(10, EXTENSIONS.length));

			const result = await ctx.ui.custom<boolean | null>((tui, theme, _kb, done) => {
				const markDirty = (): void => {
					applied = true;
				};

				const ensureVisible = (): void => {
					if (selected < scroll) scroll = selected;
					if (selected >= scroll + visibleRows) scroll = selected - visibleRows + 1;
					if (scroll < 0) scroll = 0;
					const maxScroll = Math.max(0, EXTENSIONS.length - visibleRows);
					if (scroll > maxScroll) scroll = maxScroll;
				};

				const toggle = (): void => {
					const id = EXTENSIONS[selected]?.id;
					if (!id) return;
					if (disabled.has(id)) disabled.delete(id);
					else disabled.add(id);
					markDirty();
				};

				const setAllEnabled = (enabled: boolean): void => {
					if (enabled) disabled.clear();
					else {
						for (const extension of EXTENSIONS) disabled.add(extension.id);
					}
					markDirty();
				};

				return {
					render(width: number): string[] {
						ensureVisible();
						const lines: string[] = [];
						lines.push(theme.fg("accent", theme.bold("Repo Extensions")));
						lines.push(theme.fg("dim", "↑↓ move • space toggle • a all • n none • enter save • esc cancel"));
						if (unregistered.length > 0) {
							lines.push("");
							lines.push(theme.fg("warning", truncateToWidth(`Unregistered extension files: ${unregistered.join(", ")}`, width)));
							lines.push(
								theme.fg("dim", truncateToWidth("Add them to the EXTENSIONS registry in extensions/extension-manager.ts", width)),
							);
						}
						lines.push("");

						const end = Math.min(EXTENSIONS.length, scroll + visibleRows);
						for (let i = scroll; i < end; i++) {
							const extension = EXTENSIONS[i]!;
							const enabled = !disabled.has(extension.id);
							const checkbox = enabled ? "[x]" : "[ ]";
							const prefix = i === selected ? ">" : " ";
							const plain = `${prefix} ${checkbox} ${extension.label}${extension.description ? ` — ${extension.description}` : ""}`;
							const text = truncateToWidth(plain, width);
							if (i === selected) {
								lines.push(theme.bg("selectedBg", theme.fg(enabled ? "accent" : "warning", text)));
							} else {
								lines.push(theme.fg(enabled ? "text" : "muted", text));
							}
						}

						lines.push("");
						lines.push(theme.fg("dim", formatSelectionSummary({ disabled: Array.from(disabled) })));
						return lines.map((line) => truncateToWidth(line, width));
					},
					invalidate() {},
					handleInput(data: string): void {
						if (matchesKey(data, Key.up)) {
							selected = Math.max(0, selected - 1);
							ensureVisible();
							tui.requestRender();
							return;
						}

						if (matchesKey(data, Key.down)) {
							selected = Math.min(Math.max(0, EXTENSIONS.length - 1), selected + 1);
							ensureVisible();
							tui.requestRender();
							return;
						}

						if (matchesKey(data, Key.space) || matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
							toggle();
							tui.requestRender();
							return;
						}

						if (data === "a" || data === "A") {
							setAllEnabled(true);
							tui.requestRender();
							return;
						}

						if (data === "n" || data === "N") {
							setAllEnabled(false);
							tui.requestRender();
							return;
						}

						if (matchesKey(data, Key.enter)) {
							if (!applied) {
								done(false);
								return;
							}

							saveSelection({ disabled: Array.from(disabled).sort() });
							done(true);
							return;
						}

						if (matchesKey(data, Key.escape)) {
							done(false);
						}
					},
				};
			});

			if (result !== true || !applied) return;

			ctx.ui.notify("Extension selection saved. Reloading to apply...", "info");
			await ctx.reload();
		},
	});
}
