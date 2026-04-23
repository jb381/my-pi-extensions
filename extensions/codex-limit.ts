import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type Json = Record<string, unknown>;

type RateWindow = { usedPercent?: number; resetsAt?: number | null };
type RateLimits = {
	rateLimits?: {
		primary?: RateWindow | null;
		secondary?: RateWindow | null;
		credits?: { balance?: string | null } | null;
	} | null;
};

type CodexLauncher = { command: string; args: string[] };

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function formatDuration(ms: number): string {
	const minutes = Math.max(0, Math.round(ms / 60_000));
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours && rest) return `${hours}h ${rest}m`;
	if (hours) return `${hours}h`;
	return `${rest}m`;
}

function formatUsageBar(usedPercent: number, width = 10): string {
	const used = Math.max(0, Math.min(100, usedPercent));
	const filled = Math.round((used / 100) * width);
	return `[${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}]`;
}

function getUsageColor(usedPercent: number): "success" | "warning" | "error" {
	if (usedPercent >= 80) return "error";
	if (usedPercent >= 50) return "warning";
	return "success";
}

function formatWindow(theme: { fg(color: "accent" | "success" | "warning" | "error" | "dim", text: string): string }, label: string, window?: RateWindow | null): string | null {
	if (!window) return null;
	const used = Math.max(0, Math.min(100, window.usedPercent ?? 0));
	const delta = window.resetsAt ? window.resetsAt * 1000 - Date.now() : null;
	const reset = delta === null ? "unknown" : delta <= 0 ? "now" : `in ${formatDuration(delta)}`;
	const usageColor = getUsageColor(used);
	const bar = theme.fg(usageColor, formatUsageBar(used));
	const percent = theme.fg(usageColor, `${used.toFixed(0)}%`);
	const labelText = theme.fg("accent", label.padEnd(7, " "));
	return `${labelText}: ${bar} ${percent} used, resets ${theme.fg("dim", reset)}`;
}

class RpcClient {
	private proc: ChildProcessWithoutNullStreams | null = null;
	private buffer = "";
	private nextId = 1;
	private pending = new Map<number, { resolve: (value: Json) => void; reject: (error: Error) => void }>();

	constructor(private readonly command: string, private readonly args: string[]) {}

	private failAll(error: Error): void {
		for (const { reject } of this.pending.values()) reject(error);
		this.pending.clear();
	}

	async start(options?: { initializeTimeoutMs?: number; retryOnTimeout?: boolean; onRetry?: () => void }): Promise<void> {
		const initializeTimeoutMs = options?.initializeTimeoutMs ?? 20_000;
		const retryOnTimeout = options?.retryOnTimeout ?? true;
		const onRetry = options?.onRetry;

		for (let attempt = 0; attempt < (retryOnTimeout ? 2 : 1); attempt++) {
			try {
				this.proc = spawn(this.command, [...this.args, "-s", "read-only", "-a", "untrusted", "app-server"], {
					stdio: ["pipe", "pipe", "pipe"],
					env: process.env,
				});

				this.proc.stdout.setEncoding("utf8");
				this.proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
				this.proc.stderr.on("data", () => {});
				this.proc.on("error", (error) => this.failAll(error));
				this.proc.on("exit", (code, signal) => {
					this.failAll(new Error(`Codex exited (${signal ?? code ?? "unknown"})`));
				});

				await this.request("initialize", { clientInfo: { name: "pi-codex-limit", version: "1.0.0" } }, initializeTimeoutMs);
				this.notify("initialized");
				return;
			} catch (error) {
				await this.stop();
				if (!retryOnTimeout || attempt > 0 || !(error instanceof Error) || !error.message.includes("Timed out waiting for Codex initialize")) {
					throw error;
				}

				onRetry?.();
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}
	}

	async stop(): Promise<void> {
		this.proc?.kill();
		this.proc = null;
	}

	fetchRateLimits(): Promise<RateLimits> {
		return this.request("account/rateLimits/read") as Promise<RateLimits>;
	}

	private notify(method: string): void {
		this.proc?.stdin.write(`${JSON.stringify({ method, params: {} })}\n`);
	}

	private request(method: string, params: Json = {}, timeoutMs = 10_000): Promise<Json> {
		if (!this.proc?.stdin.writable) throw new Error("Codex app-server is not running.");

		const id = this.nextId++;
		return new Promise<Json>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Timed out waiting for Codex ${method}.`));
			}, timeoutMs);

			this.pending.set(id, {
				resolve: (value) => {
					clearTimeout(timer);
					resolve(value);
				},
				reject: (error) => {
					clearTimeout(timer);
					reject(error);
				},
			});

			this.proc?.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
				if (!error) return;
				this.pending.delete(id);
				clearTimeout(timer);
				reject(error);
			});
		});
	}

	private onStdout(chunk: string): void {
		this.buffer += chunk;
		let newline = this.buffer.indexOf("\n");
		while (newline !== -1) {
			const line = this.buffer.slice(0, newline).trim();
			this.buffer = this.buffer.slice(newline + 1);
			if (line) this.onLine(line);
			newline = this.buffer.indexOf("\n");
		}
	}

	private onLine(line: string): void {
		let message: Json;
		try {
			message = JSON.parse(line) as Json;
		} catch {
			return;
		}

		if (message.id === undefined || message.id === null) return;
		const id = Number(message.id);
		const pending = this.pending.get(id);
		if (!pending) return;
		this.pending.delete(id);

		if (message.error && typeof message.error === "object") {
			const error = message.error as Json;
			pending.reject(new Error(String(error.message ?? "Codex RPC error")));
			return;
		}

		pending.resolve((message.result as Json) ?? {});
	}
}

async function resolveLauncher(pi: ExtensionAPI): Promise<CodexLauncher> {
	const binary = process.env.CODEX_BINARY?.trim();
	if (binary) return { command: binary, args: [] };

	const codex = await pi.exec("bash", ["-lc", "command -v codex"], { timeout: 3_000 });
	if (codex.code === 0 && codex.stdout.trim()) return { command: codex.stdout.trim(), args: [] };

	const npx = await pi.exec("bash", ["-lc", "command -v npx"], { timeout: 3_000 });
	if (npx.code === 0 && npx.stdout.trim()) return { command: npx.stdout.trim(), args: ["-y", "@openai/codex"] };

	throw new Error("Could not find Codex CLI. Set CODEX_BINARY or install @openai/codex.");
}

function shouldShowCredits(args: string): boolean {
	return /(^|\s)(--credits|--show-credits|-c)(\s|$)/.test(args);
}

export default function (pi: ExtensionAPI): void {
	pi.registerCommand("codex-limit", {
		description: "Show current Codex rate limits (use --credits to include balance)",
		handler: async (args, ctx) => {
			const statusKey = "codex-limit";
			let timer: ReturnType<typeof setInterval> | undefined;
			const setStatus = (text?: string) => {
				if (!ctx.hasUI) return;
				ctx.ui.setStatus(statusKey, text ? ctx.ui.theme.fg("dim", text) : undefined);
			};

			try {
				if (ctx.hasUI) {
					let i = 0;
					setStatus(`${SPINNER[i]} Checking Codex limits...`);
					timer = setInterval(() => {
						i = (i + 1) % SPINNER.length;
						setStatus(`${SPINNER[i]} Checking Codex limits...`);
					}, 90);
				}

				const launcher = await resolveLauncher(pi);
				const rpc = new RpcClient(launcher.command, launcher.args);
				try {
					await rpc.start({
						initializeTimeoutMs: 25_000,
						retryOnTimeout: true,
						onRetry: () => ctx.ui.notify("Codex is warming up, retrying once...", "warning"),
					});
					const limits = (await rpc.fetchRateLimits()).rateLimits ?? null;
					const theme = ctx.ui.theme;
					const showCredits = shouldShowCredits(args);
					const lines = [
						formatWindow(theme, "5h", limits?.primary ?? null),
						formatWindow(theme, "Weekly", limits?.secondary ?? null),
						showCredits && limits?.credits?.balance ? theme.fg("accent", `Credits: ${limits.credits.balance}`) : null,
					].filter((line): line is string => Boolean(line));

					ctx.ui.notify(lines.length ? lines.join("\n") : "No Codex limits found.", "info");
				} finally {
					await rpc.stop();
				}
			} catch (error) {
				ctx.ui.notify(`Codex limit check failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			} finally {
				if (timer) clearInterval(timer);
				setStatus(undefined);
			}
		},
	});
}
