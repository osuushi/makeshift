---
name: finalize
description: Finish a Makeshift worktree or a coherent chunk of work already in the main checkout by reviewing it, adding needed tests, running relevant checks, and integrating it into local main.
---

# Finalize Makeshift work

Use this when asked to finalize completed work. The result is a reviewed, tested commit on local `main`, or a precise account of the blocker. Follow the current `AGENTS.md` and [verification and delivery process](../../../docs/process/verification-and-delivery.md); the active user request and actual diff define the scope. An old `TICKETS.md` entry does not authorize a different increment.

## Establish the work to integrate

- Inspect `git status`, the current branch, `git worktree list`, and the diff against `main`. Identify the requested worktree or coherent chunk and its base. If several candidates fit and the request does not identify one, ask which to finalize. Include untracked files that belong to it; preserve unrelated and ignored user work.
- Review changed behavior, model ownership, Undo, docs, and the largest touched files. Check for accidental generated files, unresolved conflicts, and source files over 300 lines or functions over 80 lines. Fix material issues before integration.
- If the work is already in the main checkout, keep it there. Commit only the requested coherent chunk; there is no branch merge to perform.

## Verify the increment

- Decide whether new or changed tests are needed for the behavior introduced or the bug fixed. Add focused tests for meaningful regressions, including the ordinary input route and real geometry when an interaction changed. Do not add tests that merely mirror an implementation or a document's wording.
- For code changes, run `npm run check`, `npm run typecheck`, and affected unit/model tests with a small adjacent set. The full model gate runs in CI; repeat it locally only for a changed boundary or unresolved failure. Use compact hidden Electron smoke at product checkpoints and one focused Electron regression for an escaped integration failure. Put geometry/state combinations below the UI. For changed interaction wiring, exercise the affected real pointer/keyboard route with actual geometry. Run a different browser only for a concrete browser compatibility issue. Follow the verification process's inventory and cost budgets; do not launch broad feature tours or repeat full suites after every edit. Report device or founder review that cannot be performed as unverified.
- Before any Node-based command, from the repository root run `source /Users/adacohen/.nvm/nvm.sh && nvm use` in that command's shell. Do not substitute the default Node. Own and clean up test processes, profiles, and ports.
- A failed check is a task to fix and rerun, not a pass. If a check cannot run, record the exact reason and do not claim that it passed. Do not merge work with a known relevant test failure.

## Integrate

- For a worktree, make a purpose-based commit there after review and checks. Confirm the destination is the intended local `main` and that its working tree has no unrelated edits that the merge would disturb. Integrate the branch or commit into `main` without discarding other work; resolve conflicts deliberately and review the combined diff. A detached worktree can be integrated by its exact commit. Do not delete someone else's worktree or branch as cleanup.
- For work already on `main`, commit the reviewed chunk directly. Stage explicit paths or hunks when other work shares the checkout; verify the staged diff before committing.
- After integration, run the checks needed for the combined `main` state, especially where conflicts or adjacent changes could affect behavior. Confirm `main` contains the intended commit and inspect final status. Update the local brief with actual checks, gaps, and next action; update topic docs for lasting contracts or limitations.
- Stop at an agreed founder product review gate or unresolved product choice. Do not label implementation or automated checks as founder acceptance. Push or publish only when the current request also authorizes that action.

Report the commit on `main`, what changed, tests and runtime routes actually run, remaining verification gaps, and any review still needed.
