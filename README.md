# my-pi-extensions

A minimalist pi sidecar for the stuff I actually use.

This repo is a small, local-first package of pi extensions and helper skills I keep around to make the workflow faster, leaner, and less noisy:

- quick access to the things I check repeatedly
- tiny helpers instead of heavy machinery
- opt-in tools that stay readable and easy to trust

Built for [pi](https://pi.dev), the terminal coding harness.

## Why this exists

Because good tooling should:

- do one thing well
- stay out of the way
- feel obvious when you come back to it later

## Extensions

| Extension | What it does | Link |
|---|---|---|
| 🧩 `extensions` | Opens `/extensions` so you can enable or disable repo extensions, then reloads pi. | [`extensions/extension-manager.ts`](./extensions/extension-manager.ts) |
| ⏳ `codex-limit` | Shows current Codex rate limits on demand with `/codex-limit`. Add `--credits` if you want the balance too. | [`extensions/codex-limit.ts`](./extensions/codex-limit.ts) |

## Skills

| Skill | What it does | Link |
|---|---|---|
| 🗂️ `repo-sandbox` | Clones external repos into a reusable sandbox and browses them with bash instead of loading huge trees into context. | [`skills/repo-sandbox/SKILL.md`](./skills/repo-sandbox/SKILL.md) |

## Install

```bash
pi install ~/dev/my-pi-extensions
```

Then reload pi so it picks up the package:

```text
/reload
```

If you install this into your own pi config, it behaves like a normal pi package: extensions and skills are discovered from the repo, and the manager extension lets you toggle repo extensions without touching config files by hand.

## Extension switchboard

Open the switchboard with:

```text
/extensions
```

It gives you a quick TUI to enable or disable repo extensions.

## Notes

- Built for personal use first
- Small on purpose
- Extensions run with full system access, so only install code you trust
