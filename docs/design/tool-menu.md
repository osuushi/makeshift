# Tool panels and search

Approved interaction contract, implemented 2026-09-21. Runtime checks and the
immediate next action belong in the local brief.

## Outcome and agreed direction

Show a compact editable toolbox below Entities. Each row displays its selected
tool's icon and name. Frequent tools live in flat groups; hovering a group
opens alternatives to its right. Selecting an alternative updates that group.
Other Tools holds named nested menus whose titles never change on invocation. The tree is shared across sketch and modeling modes, and uses the
ordinary catalog activation lifecycle. Search remains the full discovery surface;
its button and Command-F / Ctrl-F open the searchable menu.
Search supports fuzzy names, synonyms and related operations. Available matches
always precede unavailable matches; unavailable tools remain visible. Automatically
highlight the top result. The following interaction is implemented.

Founder follow-up: remove the local Edit sketch / Select face / Move sketch / New
sketch button row too; its actions move into the contextual search catalog.

Selection-driven handles, local parameter/accept/cancel controls, Entities and the
agent dock keep their purposes.

## Interaction

- The Search button supports mouse, touch and Pencil. Ctrl-F is the Windows/Linux
  equivalent. Each opening starts with an empty, focused search box.
- On an empty root query, show a separate Recent section above Categories when
  tools have been invoked. Keep ten unique visible tools, newest first; invoking
  a listed tool moves it to the top. Recent retains unavailable tools with current
  prerequisite feedback and ordinary keyboard/pointer guards. Typing and category
  browsing retain their deterministic ranking and fixed order.
- Recent belongs to the current window's UI catalog, outside the document, Undo and
  saved files. Record admitted explicit invocations after the activation callback
  settles; unavailable commands, thrown errors and explicit refusal do not promote.
  Later preview/geometry acceptance is independent of invocation success. Remove
  disposed or hidden commands; omit standard file/edit actions. Automatic contextual
  tool selection and local parameter/mode changes do not count as invocations.
- Show named categories with example tool names. Opening one replaces the list
  with its tools and a breadcrumb/Back control; avoid cascading flyouts. Categories
  remain browsable even when all their tools are unavailable.
- Typing searches the entire catalog, including from a category. Clearing returns
  to that category. Submenu tool lists also put available tools first; category
  order stays fixed for learnability.
- Results show canonical name, category, shortcut and short description. Disabled
  rows show their prerequisite inline, such as “Select a body or faces to shell.”
- Query changes highlight the first ranked result and scroll it into view. Up/Down
  moves the highlight; Enter invokes it. Disabled rows remain keyboard-inspectable.
  If all matches are disabled, highlight the first but prevent execution. No matches
  produces an explicit empty state. Never truncate away the disabled results.
- Enter/Right opens a category. Back returns to its parent; Left navigates back
  only outside text editing. Escape closes the menu immediately. Outside click
  dismisses and is consumed rather than selecting underlying geometry.
- Opening, browsing and dismissing preserve ordered selection, pending previews,
  uncommitted numeric input and Undo. Escape closes only the menu and restores
  prior focus. Typing/navigation cannot fire CAD shortcuts. Agent focus retains
  its own key handling rather than opening CAD Tools from the terminal.
- Execution uses ordinary activation: finish a valid pending edit only when the
  requested switch requires it. Await ordinary acceptance and ownership release;
  invalid latest input and incomplete owners cancel before the requested action.
  Pending validation waits 500 ms before offering Wait or Cancel operation. Recheck
  availability after asynchronous finishing and prevent repeat activation. Merely
  opening the menu never finishes an edit.
- Do not open during captured geometry drags. During modal calculations allow
  discovery and deliberate completion through Wait/Cancel; nonmodal busy work
  keeps editing commands disabled with its reason visible.

## Categories

The former panel actions are registered under these homes:

| Submenu | Representative entries |
| --- | --- |
| Sketch | Line, Rectangle, Circle, Curve, Trim, sketch Offset, sketch Fillet |
| Solid | Extrude, Revolve, Shell, face Offset, Fillet, Chamfer, Union, Subtract, Intersect, Split Body, Imprint, Clean up |
| Transform | Transform (move, rotate and scale), Duplicate, Mirror |
| Constrain | Existing geometric constraints, Fuse, Unfuse, applicable locks |
| Reference | Construction plane, Project |
| Select | Select, existing selection refinements, Clear selection |
| View | Cross section, existing visibility controls, Grid snap, return to Modeling |
| Document & Edit | Export STL/3MF, Clear sketch |

Capture fixture remains available in production under Development. Its result offers
a draggable file, download, reveal and copy-path actions. Essential compact file/history
access may remain in the header; do not replace the panel with another expanded
strip. Local constraint controls remain usable; searchable entries invoke the same
actions. Catalog names must reflect implemented capabilities. Deferred features
are not advertised as disabled tools.

Standard file/edit actions stay out of Tools search and category browsing: Undo,
Redo, New, Open, Save, Save As, Close, Delete and Select All. Their ordinary keyboard shortcuts
and desktop File/Edit menus remain available. The browser's **makeshift** header button
opens File/Edit for pointer/touch access; the usual New/Open/Save shortcuts also work. CAD-specific
tools keep their shortcuts and searchable entries. Command registration and
availability guards are shared across these entry points; hiding a command from
Tools does not remove its action.

## Search contract

Use a reviewed local vocabulary with separate canonical names, aliases and related
terms; no network/AI dependency. Examples: **thickness**, **hollow** → Shell;
**bevel** → Chamfer; **round** → Fillet; **translate**, **rotate** → Move;
**twist** → Extrude. Related hits explain the connection, such as “Extrude · includes
twist,” without inventing tools. Disambiguate sketch/body variants by context.

Normalize case, accents, whitespace and punctuation. Support word prefixes,
ordered subsequences across words and small typing errors. Every query token must
match; subsequences require at least two characters, with no word-density cutoff.
For example, **cstr** and **cp** find Construction plane;
single-character queries only match word prefixes. Rank lexicographically:

1. Available before disabled, even when the disabled match is exact.
2. Within each group: exact canonical name, exact alias, literal name/alias prefix,
   word-prefix match, fuzzy match anchored at the name/alias start, other fuzzy match,
   small typing error, then related-term match.
3. Within a fuzzy tier, reward word starts (especially the first query character)
   and consecutive characters; penalize gap openings and length. Score the best
   alignment rather than the first possible alignment. **cope** matches Construction
   plane better than **cole** because **p** begins its second word. Quality cannot
   override the preceding tiers. Related terms use the same matching quality.
4. Stable canonical-name/ID tie break, without usage-history reshuffling.

Source observation: fzf's [scoring criteria and constants](https://github.com/junegunn/fzf/blob/ccedd064ca56921a4235219516b3d834f60e7b91/src/algo/algo.go#L40-L155)
reward word boundaries and consecutive chunks, penalize gaps, and give the first
character extra boundary weight. [FuzzyMatchV2](https://github.com/junegunn/fzf/blob/ccedd064ca56921a4235219516b3d834f60e7b91/src/algo/algo.go#L428)
searches for the best score. Makeshift adopts these principles with its own normalized
word vocabulary, scoring implementation and explicit prefix tiers; it does not
promise identical fzf ordering. The reference is MIT licensed; no upstream source
was copied. Ranking examples and menu activation are verified by Makeshift's search
and UI tests.

An “Unavailable in this context” divider separates the groups. Alias matches may
explain “Also called thickness.” Search admits selection-dependent tools through
the selection step below; it does not imply that a kernel calculation will succeed.

## Selection-first entry (2026-10-17)

Selection-dependent commands remain invokable in their applicable workspace. On
invocation, reuse the existing operation validation. If removing whole categories
makes the selection valid, keep the unique maximal valid combination, in original
order. Never select fewer members of a retained category, or guess between two
incomparable valid combinations. For example, Union keeps all selected bodies and
deselects a sketch; three faces for a one-face operation require explicit picking.

Otherwise enter a transient selection step: emphasize eligible visible geometry
in amber, selected inputs in blue, and show the tool's input prompt and count.
Clicks toggle inputs without modifier keys; Entities rows also participate. A
single-input tool proceeds after a valid pick. Multi-input tools require the
bottom-center **Next** button (or Enter), enabled only when existing validation
passes. Cancel/Escape restores the previous selection. Switching tools cancels
collection. A refinement already satisfied by the picked selection completes as
a no-op. Collecting inputs neither previews geometry nor edits the document;
the destination tool retains its normal preview, acceptance, cancellation and Undo.

`selection-policy.ts` inventories the affected commands: solid operations,
transforms, decorators, tag membership, sketch entry from selected geometry,
sketch offset/fillet, constraints and dimension locks, selection refinements,
isolation, copy and delete. Custom decorator Apply, Continue and Reassign use
the same picker, with Next waiting for asynchronous geometry inspection. Booleans
require two owning bodies before Next; Loft requires two ordered sections. Existing reference/axis pickers continue after
this source-selection step. Workspace, busy/calculation, missing-document,
history, visibility-state and no-export-in-progress guards remain independent;
they are not selection failures. Creation and reference tools that already start
without preselection keep their existing pickers.

## Implementation and ownership

Current entry points include `src/sketch/controls.ts`,
`src/model/modeling-tools.ts`, `src/model/body-actions.ts` and individual control
classes assembled in `src/sketch/main.ts`. Controllers supply availability reasons; solid operations reuse `modeling.resolve`.

The shared catalog in `src/tools/` holds: stable UI ID, label/category/search vocabulary,
description/shortcut, availability with reason, and activation callback. Reuse
`operation-selection.ts` for modeling applicability and extract existing sketch
and controller guards as needed. Menu and retained shortcuts consult the same
guards and invoke the same actions; do not click hidden legacy buttons.

Separate catalog, matching and menu focus/rendering responsibilities. Review files
above 300 lines/functions above 80. This is transient renderer UI; DocumentOwner,
geometry commands, edit leases, preview ownership and Undo stay authoritative.
Availability reads current state/existing results; typing launches no geometry
calculations. Preserve shared Chromium/WebKit/iPad behavior and check Electron
routing so Command-F opens Tools rather than host/browser Find.

## Delivery and acceptance

1. **Inventory and first complete route:** map old panel actions to new homes;
   build catalog/search/menu and invoke actual sketch creation and Shell through
   it. Verify thickness, a typo, disabled reasons, focus and tool switching.
2. **Common panels:** review both mode-specific lists, every icon, active state,
   existing shortcuts, disabled reasons and the Search entry point. Resize to short
   heights and confirm the toolbox remains below Entities while readouts move right.
3. **Search acceptance:** deterministic ranking tests plus real keyboard/pointer routes
   in headless Chromium/WebKit and hidden Electron. Cover browsing, global search
   from submenus, available-first ordering, all-disabled/no-result states, numeric
   focus restoration, no shortcut leakage, invalid/pending switches, busy state
   and dismissal without document changes. Create/reselect/edit actual sketch and
   solid geometry, including Shell via thickness, Undo/Redo and Save/Open. Check
   file/export and selection actions remain reachable; clean up test processes.

The search menu contract above is implemented. Runtime and founder review should be recorded in the active local brief.
Physical iPad keyboard/Pencil behavior requires device review in addition to automated
acceptance.

## Editable toolbox (2026-10-22)

The toolbox has three behaviors:

- Select and Transform are fixed standalone first and second rows. Neither can
  be dragged into a group.
- Ordinary groups are single-layer alternatives. Each shows its selected tool's
  icon and name; choosing an alternative through the toolbox, Search or a shortcut
  updates that button. Hover opens the alternatives to the right.
- Other Tools is a fixed named drawer with titled nested submenus. Clicking its
  row or a submenu opens it, never launches a remembered descendant. Choosing a
  buried tool changes no group selection or menu title. It remains in the drawer
  until the user drags it out.

The owned tree uses tool IDs or `{items, selected, title?}` groups. A title denotes
an ordinary menu rather than swapping alternatives; titles only occur in the
Other Tools subtree. Each tool occurs once, without aliases. Default frequent
alternatives cover drawing; basic primitives plus Drill; Extrude, Revolve and Loft;
Booleans; and shape editing (Fillet, Chamfer, Shell and Offset). Other Tools contains
Sketch editing, Surface details, Planes & references, and Mirror. Duplicate bodies
stays available through Search but is excluded from the toolbox. Every toolbox tool
has a dedicated icon; named menus use a folder.
Only ongoing tools belong here. Immediate commands and constraints retain their
contextual controls and Search.

Guide points remains a persistent visibility toggle below the editable tool tree.
Selecting guides also reveals a contextual Construction plane button there, with
the three-point availability rule. These reference controls do not participate in
tool regrouping or change remembered alternatives.

Only explicit choices update an ordinary group's selection. Modal tools retain
parent identity through internal steps: Cube, Cylinder and Cone remain selected
while Extrude edits their depth, and Sphere remains selected while Revolve finishes
it. Completion or cancellation keeps the parent as the remembered alternative.
Explicitly choosing Extrude or Revolve still promotes it in its own flat group.

Drag to reorder or move tools between the toolbox and drawer. Dropping a tool onto
another top-level tool creates a flat group. Inside an existing group, dropping onto
a tool places it after that tool; no nested alternatives are created. Moving an
entire group into the drawer creates a named menu; moving it out produces flat
alternatives. Hovering groups during a drag opens them to choose a destination.
The top/bottom drop indicators insert before/after a row; the center of a group
appends inside. Cycles are rejected. Empty named menus remain usable drop targets;
ordinary empty groups disappear and singletons collapse. Dragging never invokes
commands or edits geometry.

Settings has General and Toolbox tabs. The Toolbox tab shows the entire expanded
tree, supports the same dragging, and provides a top-level drop area. Selecting a
tool inside a flat group chooses its displayed alternative without invoking it.
Reset toolbox to defaults restores the authored grouping. Preferences use
`makeshift.toolbox.v5`, outside documents and Undo, with storage-event sync between
windows. Migration from v4 separates the primitive and profile-based solid families,
pins Transform, removes Duplicate and moves Mirror into the drawer while preserving
unrelated customization and remembered alternatives. Migration from v3/v2 also
flattens old swapping groups and moves infrequent grouped tools into the named
drawer. Old preference values remain available.

Click the main tool button to invoke it; the separate arrow opens alternatives for
touch and keyboard access. Up/Down navigates siblings, Right opens a group, Left
returns, and Escape closes discovery without accepting a pending numeric edit.
Opening Search by clicking or tapping its button, activating it with the keyboard,
or using the shortcut closes flyouts and transfers borrowed focus to Search.
Dismissing Search restores the original numeric field without accepting its draft. Unavailable tools
retain their positions and explanatory tooltips; menu/group arrows stay usable.
Physical iPad/Pencil ergonomics still require device review.
