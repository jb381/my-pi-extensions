/**
 * yeet – git add, commit & push in one command.
 *
 * Inspired by davis7dotsh's original:
 * https://github.com/davis7dotsh/my-pi-setup/blob/main/extensions/yeet.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";

const YEET_PROMPT = `Commit and push the current repository changes.

Steps:
1. Run \`git add -A\`.
2. Write a semantic (conventional) commit message: \`type(scope): description\`.
   - Infer \`type\` from changes: \`feat\` for new features, \`fix\` for bug fixes,
     \`docs\` for docs/readme, \`refactor\` for code restructuring, \`chore\` for tooling/deps.
3. Commit with that message, then push to the current branch's remote.
   - Set upstream if needed. Skip push if no remote is configured.
4. After pushing, print the remote URL.
   - If branch is \`main\`, print repo URL.
   - If branch is not \`main\`, print a PR-creation URL into \`main\`.
   - Convert SSH remotes (\`git@github.com:user/repo.git\`) to HTTPS.

If git fails at any point, explain the error clearly and suggest how to fix it.`;

export default function (pi: ExtensionAPI) {
  pi.registerCommand("yeet", {
    description: "Add, commit, and push the current repo changes",
    handler: async (args, ctx) => {
      // Short-circuit if there's nothing to commit
      try {
        const status = execSync("git status --porcelain", { encoding: "utf8" }).trim();
        if (!status) {
          ctx.ui.notify("Nothing to commit — working tree clean 🧹", "info");
          return;
        }
      } catch {
        ctx.ui.notify("Not a git repository or git not available", "error");
        return;
      }

      const prompt = args?.trim()
        ? `${YEET_PROMPT}\n\nAdditional instructions from the user:\n${args.trim()}`
        : YEET_PROMPT;

      if (ctx.isIdle()) {
        pi.sendUserMessage(prompt);
      } else {
        pi.sendUserMessage(prompt, { deliverAs: "followUp" });
        ctx.ui.notify("Queued /yeet as a follow-up", "info");
      }
    },
  });
}
