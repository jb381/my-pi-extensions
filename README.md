# my-pi-extensions

A small, opinionated collection of **pi** extensions.

Built for [pi](https://pi.dev) — the terminal coding harness.
Source: [badlogic/pi-mono](https://github.com/badlogic/pi-mono).

## What’s inside

| Extension | Type | What it does | Link |
|---|---|---|---|
| 🧩 `extensions` | Interactive selector | Opens `/extensions`, where you can enable or disable repo extensions, then reloads pi to apply the change. Minimal by design: no background state, no persistent footer UI, and no extra dependencies. | [`extensions/extension-manager.ts`](./extensions/extension-manager.ts) |
| ⏳ `codex-limit` | Command + status spinner | Shows your current Codex limits on demand with `/codex-limit`. Minimal, no background polling, just a quick status check when you ask for it. | [`extensions/codex-limit.ts`](./extensions/codex-limit.ts) |

## If you want to use these extensions

### 1. Install the repo into pi

```bash
pi install ~/dev/my-pi-extensions
```

### 2. Reload pi

```text
/reload
```

### 3. Open the selector

```text
/extensions
```

### 4. Selector keys

Inside the selector:
- `↑↓` move
- `space` toggle
- `a` enable all
- `n` disable all
- `enter` save + reload
- `esc` cancel

### 5. Use the enabled commands

```text
/codex-limit
```

> Note: pi does not support truly unloading an extension that is already running. This package keeps things simple: one manager extension is always loaded, and it conditionally enables the repo extensions listed in a small static registry. Your choices are saved to `~/.pi/agent/extensions/my-pi-extensions.json` and applied on reload.

## What kinds of extensions can pi do?

pi extensions are TypeScript modules, and they can do a lot more than add commands.

Common extension types and capabilities:

- **Custom tools** — register tools the model can call
- **Custom commands** — add slash commands like `/codex-limit`
- **Lifecycle hooks** — react to session, model, tool, or agent events
- **UI helpers** — show notifications, prompts, selectors, widgets, and status text
- **Session state** — store data that survives restarts
- **Tool interception** — block, patch, or wrap built-in tool behavior
- **Custom rendering** — change how messages and tool results appear
- **Provider support** — register or override model/provider behavior

Full docs:

- [Extensions docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [Extension examples](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions)

## Repo layout

This repo is intentionally small and pi-friendly:

- `package.json` points pi at a single entrypoint: `extensions/extension-manager.ts`
- the manager keeps a tiny static registry of repo extensions
- selection state is stored in one JSON file under the pi agent directory
- no runtime filesystem discovery or external dependencies are required

```text
my-pi-extensions/
├── extensions/
│   ├── codex-limit.ts
│   └── extension-manager.ts
├── package.json
├── README.md
└── .gitignore
```

## Notes

- Built for personal use first
- Small and readable on purpose
- Extensions run with full system access, so only install code you trust
