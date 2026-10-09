# Development process

The primary agent owns architecture, checks, integration and final commits.
The founder authorized three GPT-6 Astra agents with low reasoning effort on
2026-09-21 for construction planes/cutting, scaling and symmetric gestures.
They implement and verify in separate Git worktrees; the primary agent reviews
and integrates their changes sequentially. This is a bounded exception to the
default of no subagents, not a revival of the former delegation process.
The 2026-09-14 reset replaced the old proof queue and revision protocols.

## Resume and execute

1. Read the short [architecture](architecture.md) overview; inspect Git and local
   `TICKETS.md` against the current user request. Read topic docs only as needed.
   Old briefs and history do not authorize work or supersede founder decisions.
2. Keep one local, untracked brief (normally 10–20 lines): user outcome,
   interaction, model ownership/Undo, acceptance route, scope/estimate, next review.
3. Implement a complete input-to-geometry path, including subsequent editing.
   Continue routine engineering work autonomously; stop at the agreed product
   checkpoint or a real unresolved product choice.
4. Verify ordinary pointer/keyboard routes and real geometry, adjacent regressions,
   and the largest touched files. Review and commit a coherent unit; preserve user work.
5. On interruption record working behavior, checks/gaps, owned processes and the
   next concrete action in that brief. Keep lasting contracts and known limitations
   in topic docs. Do not create status ledgers or a central review queue.

Aim for a running result within an hour and a reviewed increment in roughly two.
Reassess after 30 minutes without interaction progress or two failed attempts at
one obstacle. Report a changed estimate before exceeding it. Time limits prompt
scope reassessment, never weaker acceptance or an unsupported completion claim.

Every abstraction must serve a current accepted interaction. Keep one document
owner and one edit at a time. Warn above 300 source lines or 80 function lines;
split by responsibility, never compress or scatter forwarding helpers to evade limits.

## Read when needed

- [Briefs, working loop and scope checks](process/increments.md): implementation work.
- [Architecture discipline](process/architecture-discipline.md): new modules/dependencies.
- [Verification, setup and delivery](process/verification-and-delivery.md): acceptance,
  runtime/host checks, reproducible setup, commits and handoff.

Default to unit/model tests; routine UI coverage is compact hidden Electron smoke
and focused integration regressions. Browser-specific checks need a specific
compatibility reason. See the verification procedure for test placement and budgets.
Visible apps are for founder review. Own and clean up test processes.
For reported model bugs, read the development Capture fixture JSON; ask for its
path if missing. Never extract the live model through computer use.

Keep this resume procedure short. Detailed procedures belong in the linked files;
read source and relevant FreeCAD reference chapters only for the task at hand.
