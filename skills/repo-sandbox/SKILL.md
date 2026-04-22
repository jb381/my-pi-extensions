---
name: repo-sandbox
description: Use when the user asks to inspect a repository. Clone external repos into a reusable sandbox directory and browse them with bash instead of reading large trees into chat.
---

# Repo Sandbox

If the repo is external, use a sandbox directory first.

Default sandbox:

```bash
~/dev/agent-sandbox
```

Use `~/dev/agent-sandbox`; create it if missing. If the repo is already cloned there, reuse it; otherwise clone it.

For local repos, inspect the existing path in place.

Use bash tools like `git`, `find`, `rg`, and `ls` to browse the checkout, then summarize only what matters.
