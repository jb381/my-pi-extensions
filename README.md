# my-pi-extensions

A small, opinionated collection of **pi** extensions and helper skills.

Built for [pi](https://pi.dev), the terminal coding harness.

## Extensions

| Extension | What it does | Link |
|---|---|---|
| 🧩 `extensions` | Opens `/extensions` so you can enable or disable repo extensions, then reloads pi. | [`extensions/extension-manager.ts`](./extensions/extension-manager.ts) |
| ⏳ `codex-limit` | Shows current Codex rate limits on demand with `/codex-limit`. | [`extensions/codex-limit.ts`](./extensions/codex-limit.ts) |

## Skills

| Skill | What it does | Link |
|---|---|---|
| 🗂️ `repo-sandbox` | Clones external repos into a reusable sandbox and browses them with bash instead of loading huge trees into context. | [`skills/repo-sandbox/SKILL.md`](./skills/repo-sandbox/SKILL.md) |

## Use it

```bash
pi install ~/dev/my-pi-extensions
```

Then reload pi:

```text
/reload
```

Open the selector:

```text
/extensions
```

Selector keys:

- `↑↓` move
- `space` toggle
- `a` enable all
- `n` disable all
- `enter` save + reload
- `esc` cancel

Use the command:

```text
/codex-limit
```

> Note: pi does not support truly unloading an extension that is already running. This repo keeps one manager extension always loaded and uses a small static registry to toggle the repo extensions. Selection is saved to `~/.pi/agent/extensions/my-pi-extensions.json` and applied on reload.

## Repo layout

```text
my-pi-extensions/
├── extensions/
│   ├── codex-limit.ts
│   └── extension-manager.ts
├── skills/
│   └── repo-sandbox/
│       └── SKILL.md
├── package.json
├── README.md
└── .gitignore
```

## Development

- `npm run typecheck` — type-check the TypeScript sources
- `npm run check` — alias for `typecheck`

## Notes

- Built for personal use first
- Small and readable on purpose
- Extensions run with full system access, so only install code you trust
