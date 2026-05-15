# 🧠 Agent Harness Feature Ideas for pi

> Ideas collected from researching open-source agent harnesses: **OpenCode** (Go, GitHub 72k★ → now [Crush](https://github.com/charmbracelet/crush)), **Aider** (Python, 43k★), **Goose** (Rust, 41k★, Block/Linux Foundation), **Codex CLI** (Rust, 67k★, OpenAI), and others.

*Generated 2026-05-15 by researching and cloning these repos into `~/.pi/agent/sandbox/`.*

---

## Table of Contents

1. [LSP Integration for Code Intelligence](#1-lsp-integration-for-code-intelligence)
2. [Sub-Agent / Nested Agent Orchestration](#2-sub-agent--nested-agent-orchestration)
3. [MCP (Model Context Protocol) Support](#3-mcp-model-context-protocol-support)
4. [Scheduled / Cron-Based Agent Jobs](#4-scheduled--cron-based-agent-jobs)
5. [Lifecycle Hooks System (Plugin Hooks)](#5-lifecycle-hooks-system-plugin-hooks)
6. [AGENTS.md / .goosehints / CLAUDE.md — Structured Project Context Files](#6-agentsmd--goosehints--claudemd--structured-project-context-files)
7. [Persistent Tool Permission Store (Allow/Deny Memory)](#7-persistent-tool-permission-store-allowdeny-memory)
8. [Architect → Editor Multi-Model Pipeline](#8-architect--editor-multi-model-pipeline)
9. [Git-Based Repo Map / Codebase Awareness](#9-git-based-repo-map--codebase-awareness)
10. [Auto-Linting & Self-Healing After Edits](#10-auto-linting--self-healing-after-edits)
11. [Codex-Style Skills Directory (Structured Agent Workflows)](#11-codex-style-skills-directory-structured-agent-workflows)
12. [Gateway / Multi-Platform Interface (Telegram, Slack, etc.)](#12-gateway--multi-platform-interface-telegram-slack-etc)
13. [Recipes / Composable Agent Templates](#13-recipes--composable-agent-templates)
14. [Token Budget Management & Smart Truncation](#14-token-budget-management--smart-truncation)
15. [Auto-Compact with Summarization](#15-auto-compact-with-summarization)
16. [Context Size-Aware Tool Selection](#16-context-size-aware-tool-selection)
17. [Remote Agent Execution (Headless / Cloud Sandbox)](#17-remote-agent-execution-headless--cloud-sandbox)
18. [Multi-Session / Parallel Agent Tabs](#18-multi-session--parallel-agent-tabs)
19. [Diff-Based Code Review PR Bot](#19-diff-based-code-review-pr-bot)
20. [Structured Output / JSON Mode](#20-structured-output--json-mode)

---

## 1. LSP Integration for Code Intelligence

**Found in:** OpenCode (`internal/lsp/`), Aider (indirect via tree-sitter)

**What it does:** Connects to Language Server Protocol servers (TypeScript, Rust, Python, etc.) to provide code intelligence: go-to-definition, find-references, hover info, diagnostics, completions, and symbol search.

**Why it's cool for pi:**
- Agent can navigate unknown codebases intelligently (e.g., "where is the `handleAuth` function defined?")
- Get diagnostics from LSP before writing code (know the type of a variable, find unused imports)
- OpenCode's LSP integration is a full client with: `textDocument/completion`, `textDocument/definition`, `textDocument/references`, `textDocument/documentSymbol`, `textDocument/hover`, `textDocument/codeAction`, `workspace/symbol`, and **diagnostics streaming**

**Implementation complexity:** Medium-high. Would need to spawn LSP servers per-file-type, manage lifecycle, handle crashes.

**Quick win:** Start with tree-sitter based symbol extraction (like Aider's `repomap.py` uses) before investing in full LSP.

---

## 2. Sub-Agent / Nested Agent Orchestration

**Found in:** OpenCode (`internal/llm/agent/agent-tool.go`), Goose (`agents/subagent_execution_tool/`), Claude Code ("Agent Teams")

**What it does:** Spawn parallel/nested agent sessions that can work independently on sub-tasks and report back. The main agent delegates work to sub-agents and collects results.

**Why it's cool for pi:**
- Parallelize research tasks (e.g., "search for X in files, while also looking up docs online, while also checking the database schema")
- Sub-agents can have different model configurations (cheaper model for search, expensive model for code generation)
- OpenCode's implementation is clean: `agentTool` creates a new session, runs a prompt in it, collects the result — all with access to a subset of tools
- Goose has a dedicated `subagent_execution_tool/` module with notification events and task configs

**Implementation complexity:** Medium. pi already has sessions infrastructure; would need session-for-session sharing and tool visibility control.

**Note:** pi explicitly skips sub-agents by default ("skips features like sub agents and plan mode"), making this a perfect extension.

---

## 3. MCP (Model Context Protocol) Support

**Found in:** OpenCode (`internal/llm/agent/mcp-tools.go`), Goose (`crates/goose-mcp/`, `crates/goose/src/agents/mcp_client.rs`)

**What it does:** Adds support for the [Model Context Protocol](https://modelcontextprotocol.io/) — an open standard for connecting agents to external tools, data sources, and services. MCP tools are auto-discovered from configuration and exposed as native agent tools.

**Why it's cool for pi:**
- Access to a growing ecosystem of 70+ MCP servers (filesystem, GitHub, databases, web scraping, Figma, etc.)
- OpenCode wraps MCP tools via `mark3labs/mcp-go` client — each MCP server's tools are prefixed and exposed as native tools
- Goose has a full `goose-mcp` crate with built-in MCP servers for development, computer control, memory, and more
- MCP would make pi extensible without writing custom TypeScript extensions for every integration

**Implementation complexity:** Medium. Need an MCP client library and discovery mechanism.

---

## 4. Scheduled / Cron-Based Agent Jobs

**Found in:** Goose (`crates/goose/src/scheduler.rs`)

**What it does:** Schedule agent tasks to run at specific times via cron expressions. Goose stores scheduled jobs persistently, runs them at the right time, and reports results.

**Why it's cool for pi:**
- "Run tests every morning at 8 AM and report failures"
- "Check for dependency updates every Friday"
- "Generate a weekly status report"
- Goose's scheduler uses `tokio-cron-scheduler` with persistent storage, job lifecycle management, and cancellation tokens
- Supports: recurring jobs, one-shot scheduled jobs, recurring recipe executions

**Implementation complexity:** Medium. Need a background process/RPC mode integration with cron.

---

## 5. Lifecycle Hooks System (Plugin Hooks)

**Found in:** Goose (`crates/goose/src/hooks/`)

**What it does:** Plugin system that fires hooks at lifecycle events: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `BeforeReadFile`, `AfterFileEdit`, `BeforeShellExecution`, `AfterShellExecution`, `Stop`.

**Why it's cool for pi:**
- Extensions can react to specific events without modifying core logic
- Hook scripts (bash, python, etc.) receive structured JSON on stdin and can modify behavior
- Allows plugins to implement audit logging, security scanning, notification webhooks, etc.
- Already follows the [Open Plugins hooks specification](https://open-plugins.com/agent-builders/components/hooks)
- pi already has event hooks (`pi.on()`) — this would formalize and expand the lifecycle with filesystem-based plugin discovery

**Implementation complexity:** Low-Medium. pi already has `pi.on()` for many events; adding filesystem-discovered hooks with JSON stdin/stdout would be relatively straightforward.

---

## 6. AGENTS.md / .goosehints / CLAUDE.md — Structured Project Context Files

**Found in:** Goose (`.goosehints`, `AGENTS_MD_FILENAME`), Codex CLI (`AGENTS.md`), Claude Code (`CLAUDE.md`), pi (`AGENTS.md`, `SYSTEM.md`)

**What it does:** Project-level markdown files that define agent behavior, architecture, conventions, and constraints. They're loaded automatically by the agent at session start.

**Why it's cool for pi:**
- pi already supports `AGENTS.md` and `SYSTEM.md`! This is already a strength.
- Goose extends this with:
  - `.goosehints` — focused, scoped hints files that are searched across directories (including `~/.goosehints` global)
  - `SubdirectoryHintTracker` — walks project tree collecting hints from subdirectories
  - Auto-respects `.gitignore` patterns when collecting context files
- Codex CLI's `AGENTS.md` is a comprehensive file with coding standards, architecture decisions, and project-specific conventions
- The key idea: **structured context files with sections** (build, test, style, architecture) that compose recursively

**Implementation complexity:** Low (enhance what we already have). Add subdirectory-scanning for `AGENTS.md`, global fallback, and `.gitignore` awareness.

---

## 7. Persistent Tool Permission Store (Allow/Deny Memory)

**Found in:** Goose (`crates/goose/src/permission/`), OpenCode (`internal/permission/`)

**What it does:** Remembers user decisions about tool execution permissions — "always allow this tool," "always deny," "ask every time." Stores permissions in a JSON file with context hashes and optional expiry.

**Why it's cool for pi:**
- Once you approve "npm install" for a project, it stays approved (no repeated prompts)
- Fine-grained: allow/deny based on tool name AND argument context (hash of tool call context)
- Permissions can have expiry dates (auto-revoke after N hours)
- Goose's `ToolPermissionStore`: blake3-hashed context, version-aware schema, atomic file writes via temp+rename, expiry cleanup on load
- OpenCode's `permission.Service` is simpler but effective with allow/deny/ask modes

**Implementation complexity:** Low-Medium. pi already has tool event interception (`pi.on("tool_call")`). Just need a persistence layer.

---

## 8. Architect → Editor Multi-Model Pipeline

**Found in:** Aider (`coders/architect_coder.py`)

**What it does:** Aider's "Architect" mode uses one model (e.g., Claude Opus) to plan/architect a solution, then passes the plan to a cheaper "Editor" model (e.g., DeepSeek) to implement the actual file changes.

**Why it's cool for pi:**
- Use powerful (expensive) model for reasoning/planning, cheap model for code generation
- Architect identifies files to change, suggests approach, describes the edit in detail
- Editor model executes the concrete changes with high precision
- Dramatic cost savings: Aider reports ~4.2x token efficiency vs Claude Code
- pi's BYOM model makes this especially practical — use Sonnet for architect, Haiku or DeepSeek for edits

**Implementation complexity:** Medium. Need two model sessions and a handoff protocol between them.

---

## 9. Git-Based Repo Map / Codebase Awareness

**Found in:** Aider (`repomap.py`)

**What it does:** Builds a structural map of the entire codebase using tree-sitter AST parsing and TF-IDF ranking. Shows the agent the most relevant files and their structure (classes, functions, methods) without reading every file.

**Why it's cool for pi:**
- Agent knows what functions/classes exist and where, before reading any files
- Reduces token waste from blindly reading files to understand structure
- Aider's `RepoMap`: 1) Tags every symbol in the repo (class, function, method → file + line), 2) Builds TF-IDF ranked tag map, 3) Returns top-N ranked tags up to token budget
- Uses `grep_ast` and tree-sitter query files for accurate parsing
- Caches results in `.aider.tags.cache.v{version}` (speeds up subsequent runs)
- Also used for: "what files reference X?" type questions

**Implementation complexity:** High. Requires tree-sitter grammars for each language, TF-IDF ranking, and disk caching. But the value is enormous for codebase-level reasoning.

---

## 10. Auto-Linting & Self-Healing After Edits

**Found in:** Aider (`linter.py`, `/aider/coders/base_coder.py`)

**What it does:** After every edit, Aider automatically runs the appropriate linter (ESLint, pylint, clippy, etc.) on the changed file, captures errors, and asks the model to self-fix them in a loop.

**Why it's cool for pi:**
- No more "the code compiles but has 50 lint errors"
- Self-healing: agent runs in a loop of "edit → lint → fix → lint → done"
- Per-language lint commands configured via settings or auto-detected
- Linter integration with `run_cmd_subprocess` for async execution
- Combined with the repo map, Aider can also auto-fix import errors and type mismatches

**Implementation complexity:** Low-Medium. Run the appropriate linter after edits, pipe errors back as tool call results.

---

## 11. Codex-Style Skills Directory (Structured Agent Workflows)

**Found in:** Codex CLI (`.codex/skills/`)

**What it does:** A structured directory of `SKILL.md` files that define complete agent workflows — each skill has:
- A `SKILL.md` with objective, workflow steps, inputs, commands
- Optional `agents/` directory with YAML agent configs
- `scripts/` with helpers (Python, bash)
- `references/` with documentation snippets

**Why it's cool for pi:**
- Examples from Codex CLI: PR babysitter, code review (4 variants), bug triage, issue digest, remote test execution
- A skill like "babysit-pr" autonomously: watches CI → detects failures → classifies them → fixes code if branch-related → retries flaky tests → marks review threads as resolved
- pi already has skills (`.pi/agent/skills/`), but they're simpler — this would add structured workflow definitions with sub-steps, decision trees, and scripts

**Implementation complexity:** Medium. pi's skills are basically `SKILL.md` files already. The innovation is: multiple sub-agents per skill, reference docs, actual scripts that get called, and persistent execution state (watchers that run across turns).

---

## 12. Gateway / Multi-Platform Interface (Telegram, Slack, etc.)

**Found in:** Goose (`crates/goose/src/gateway/`)

**What it does:** Goose has a gateway system that lets you interact with the agent through platforms like Telegram, Slack, or custom UIs — not just the terminal.

**Why it's cool for pi:**
- "Deploy the agent to Telegram so I can ask it to fix production issues from my phone"
- Goose's `TelegramGateway`: polls Telegram for messages → sends to agent → replies as Telegram messages
- Supports voice notes (speech-to-text), long message splitting, retry with backoff
- Gateway pattern is extensible: add Slack, Discord, webhooks, etc.
- `GatewayHandler` trait abstracts the platform → agent communication

**Implementation complexity:** Medium-High. Would need pi running as a daemon (or RPC mode acting as a server). But RPC mode already exists and could be the transport.

---

## 13. Recipes / Composable Agent Templates

**Found in:** Goose (`crates/goose/src/recipe/`)

**What it does:** Goose has a recipe system — YAML templates that define composable multi-step agent workflows. Recipes can include other recipes, define variables, specify prompts, and configure extensions.

**Why it's cool for pi:**
- "Create a new project" → pick a recipe → agent follows the template steps (create dir, init git, install deps, scaffold files, run first build)
- "Review this PR" → recipe reads diff, checks test coverage, runs linter, generates review comments
- Recipes are YAML files stored in a recipes dir, with local overrides
- `build_recipe_from_template` expands templates with variables
- `template_recipe.rs` handles Jinja-like template rendering
- Composable: one recipe can "include" another recipe's steps

**Implementation complexity:** Medium. Could build on pi's existing command system.

---

## 14. Token Budget Management & Smart Truncation

**Found in:** Aider (implicit, 4.2x token efficiency), Goose (`token_counter.rs`)

**What it does:** Track, budget, and optimize token usage across the session. Key features:
- Per-invocation token counting for budgeting
- Smart truncation of tool outputs (not just dropping, but summarizing)
- Token-aware context management (decide what to keep, summarize, or drop)
- File diffs instead of full file writes (Aider style, reduces 50%+ tokens)

**Why it's cool for pi:**
- pi already shows token usage in the footer; this would add active management
- When approaching context limit, auto-summarize oldest messages
- Tool output truncation with "intelligent cut" (not just X characters, but sensible boundaries)
- Aider's diff-based edits are inherently more token-efficient than writing full files

**Implementation complexity:** Medium. Could leverage pi's existing compaction mechanism.

---

## 15. Auto-Compact with Summarization

**Found in:** Goose (`context_mgmt/mod.rs`), OpenCode (auto-compact feature)

**What it does:** When the conversation approaches the model's context window limit (default: 80% threshold), automatically summarize old messages and replace them with the summary, allowing the conversation to continue without losing context.

**Why it's cool for pi:**
- pi already has manual compaction — this would add automatic, configurable compaction
- Goose's implementation: `compact_messages()` summarizes old messages, adds a continuation text ("Your context was compacted. Continue naturally."), handles tool loops gracefully (summarizes tool call pairs in batches of 10)
- OpenCode's auto-compact: monitors token usage, auto-triggers at 95% of context window
- Three modes: auto (when threshold reached), manual (user-triggered), forced (before critical operations)

**Implementation complexity:** Low-Medium. pi already has compaction infrastructure, this adds automation and smarter summarization strategies.

---

## 16. Context Size-Aware Tool Selection

**Found in:** Aider (`repomap.py` — `map_tokens` parameter)

**What it does:** The agent is aware of its remaining context budget and adjusts its tool usage accordingly. Aider's `map_tokens` parameter limits how many tokens the repo map consumes based on available context.

**Why it's cool for pi:**
- When context is near limit, prefer smaller/cheaper operations (grep over full file read, diff over write)
- Scale repo map / context details based on remaining budget
- Auto-switch to summary mode when approaching limits
- Prevent "context window exceeded" crashes by proactive management

**Implementation complexity:** Medium. Requires tracking remaining context and making tool selection aware of it.

---

## 17. Remote Agent Execution (Headless / Cloud Sandbox)

**Found in:** Codex CLI (cloud containers, `exec/`, `sandboxing/`), Goose (desktop app, `goose-server`)

**What it does:** Run agent tasks in isolated remote environments — cloud containers, sandboxed VMs, or remote machines. Tasks persist even when you close your local terminal.

**Why it's cool for pi:**
- "Deploy this microservice" — agent runs on the server, not your laptop
- Isolated execution: each task gets its own filesystem sandbox
- Codex CLI's architecture: cloud containers managed by OpenAI, `sandboxing/` crate for macOS seatbelt, Linux bwrap, Windows sandbox
- Goose's `goose-server` is a REST/WebSocket API for running agents remotely (with OpenAPI spec, used by desktop app)
- Task persistence: start a task on your laptop, check results from your phone later
- pi's RPC mode is the natural foundation for this (already designed for process integration)

**Implementation complexity:** High. But RPC mode already provides the integration point. pi could offer a lightweight remote execution API.

---

## 18. Multi-Session / Parallel Agent Tabs

**Found in:** OpenCode (`internal/session/`), Goose (session manager), Cursor ("parallel Agent Tabs")

**What it does:** Run multiple independent agent sessions in parallel, each with its own context, file state, and model.

**Why it's cool for pi:**
- "Work on feature A in one session while feature B runs in another"
- pi already has session branching (tree-structured history) — this extends to parallel execution
- Sessions have independent context windows → no shared context limits
- Goose's `SessionManager` supports multiple session types (normal, task, schedule)
- OpenCode's sessions stored in SQLite with `session.Service` interface

**Implementation complexity:** Medium. Builds on pi's existing session system.

---

## 19. Diff-Based Code Review PR Bot

**Found in:** Codex CLI (`.codex/skills/babysit-pr/`, `.codex/skills/code-review/`), pi review extension

**What it does:** Autonomous PR reviewer that watches GitHub PRs, analyzes diffs, surfaces issues, monitors CI, and retries flaky failures.

**Why it's cool for pi:**
- pi already has a `/review` extension — this would make it autonomous and persistent
- Codex's "babysit-pr" skill: watches PR → gets review comments → fixes code → pushes → marks threads resolved → loops
- Code review skills: breaking changes detection, change size estimation, context analysis, testing review
- All skills have structured SKILL.md with objectives, inputs, commands, and scripts
- Could be extended to bitbucket, gitlab, gitea

**Implementation complexity:** Medium. pi already has `/review` extension; adding PR watching, CI monitoring, and auto-fix would be a natural extension.

---

## 20. Structured Output / JSON Mode

**Found in:** Goose (`prompt_template.rs`), Aider (editor diffs), pi (JSON mode)

**What it does:** Request structured output from the model (JSON, YAML, or custom schemas) instead of freeform text, making results parseable by automation systems.

**Why it's cool for pi:**
- pi already has JSON output mode (`pi --json`) — this formalizes schema-driven structured output
- Goose uses structured output for: plan steps, ticket summaries, code review findings, configuration generation
- Aider's editor diffs are a form of structured output (machine-parseable edit instructions)
- Combined with RPC mode: pi returns structured results like `{ "files_changed": [...], "errors": [...], "summary": "..." }`
- Schema-driven: the calling system defines the expected output schema, pi ensures the model conforms

**Implementation complexity:** Low. Already partially supported; formalize the protocol and add schema validation.

---

## Priority Matrix

| # | Idea | Impact | Complexity | Quick Win? |
|---|------|--------|------------|-----------|
| 6 | AGENTS.md enhancements | High | Low | ✅ |
| 7 | Tool permission store | Medium | Low | ✅ |
| 10 | Auto-lint after edits | High | Low-Medium | ✅ |
| 15 | Auto-compact | Medium | Low-Medium | ✅ |
| 20 | Structured output | Medium | Low | ✅ |
| 3 | MCP support | High | Medium | |
| 2 | Sub-agents | High | Medium | |
| 8 | Architect→Editor pipeline | High | Medium | |
| 14 | Token budget management | Medium | Medium | |
| 18 | Parallel sessions | Medium | Medium | |
| 19 | PR babysitter bot | High | Medium | |
| 1 | LSP integration | High | Medium-High | |
| 4 | Cron scheduling | Medium | Medium | |
| 11 | Codex-style skills | High | Medium | |
| 5 | Lifecycle hooks | Medium | Medium | |
| 9 | Repo map | High | High | |
| 12 | Gateway (Telegram etc.) | Medium | Medium-High | |
| 13 | Recipes | Medium | Medium | |
| 16 | Context-aware tools | Medium | Medium | |
| 17 | Remote execution | High | High | |

---

## Next Steps (Recommended Order)

1. **Quick wins first** (low complexity, high value): Enhance AGENTS.md with subdirectory scanning, add auto-lint, build persistent tool permissions, implement auto-compact
2. **Extensions core** (medium complexity, high impact): MCP support, sub-agents, Architect→Editor pipeline — these add the most capability per implementation effort
3. **Advanced features** (higher complexity): Repo map, LSP, remote execution, gateway

Once the quick wins are done, pi would have a more polished developer experience. After the mid-tier features, pi would match or exceed the feature set of every other open-source harness.

---

## Repositories Referenced

| Repository | Language | Stars | Key Features |
|-----------|----------|-------|-------------|
| [OpenCode → Crush](https://github.com/charmbracelet/crush) | Go | 72k | LSP, MCP, sub-agents, TUI, multiple providers |
| [Aider](https://github.com/Aider-AI/aider) | Python | 43k | Repo map, architect→editor, auto-lint, git-first |
| [Goose](https://github.com/block/goose) | Rust | 41k | Hooks, scheduling, gateway, permissions, recipes, ACP |
| [Codex CLI](https://github.com/openai/codex) | Rust | 67k | Skills directory, sandboxing, remote exec, AGENTS.md |
| [Claude Code](https://github.com/anthropics/claude-code) | TypeScript | 114k | Agent Teams, CLAUDE.md, computer use |
