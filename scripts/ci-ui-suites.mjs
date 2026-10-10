// PR UI coverage is Electron smoke + escaped integration regressions, once each.
// Exhaustive feature journeys live in ui-review-suites.mjs for targeted diagnosis.
// Add combinatorial cases to the linked lower-level tests, not this inventory.
export const uiSuites = [
  {
    args: ["primitive-handoff-ui.mjs"],
    seconds: 60,
    browsers: ["electron"],
    reason:
      "Circle placement must release its pointer lease into editable Extrude/Revolve with the correct profile, axis, mode and drill direction.",
    unit: "sphere-primitive.test.ts",
  },
  {
    args: ["cube-selection-ui.mjs"],
    seconds: 15,
    browsers: ["electron"],
    reason:
      "Async Cube handoff must not consume the first real face click after extrusion completion.",
    unit: "tool-switching.test.ts",
  },
  {
    args: ["selection-redo-ui.mjs"],
    seconds: 10,
    browsers: ["electron"],
    reason: "Real picks after Undo must retain geometry Redo across the renderer/host boundary.",
    unit: "selection-redo.test.ts",
  },
  {
    args: ["command-readiness-ui.mjs"],
    seconds: 13,
    browsers: ["electron"],
    reason:
      "Tool clicks await numeric acceptance, and native Fillet rejection must retain the field focus, error and explicit cancellation.",
    unit: "tool-switching.test.ts",
  },
  {
    args: ["face-offset-readiness-ui.mjs"],
    seconds: 9,
    browsers: ["electron"],
    reason: "Modal completion must await held native preview publication before accepting.",
    unit: "calculation-wait.test.ts",
  },
  {
    args: ["decorator-removal-ui.mjs"],
    seconds: 14,
    browsers: ["electron"],
    reason: "Removing a decorator must clear a late worker result and rendered picking state.",
    unit: "decorator-display.test.ts",
  },
  {
    args: ["thread-correction-ui.mjs"],
    seconds: 10,
    browsers: ["electron"],
    reason: "Correcting a rejected thread field must recover focus and ordinary acceptance.",
    unit: "decorator-settings-draft.test.ts",
  },
  {
    args: ["body-operation-selection-ui.mjs"],
    seconds: 26,
    browsers: ["electron"],
    reason: "Operation widgets must receive the actual ordered body selection after tool switches.",
    unit: "operation-selection.test.ts",
  },
  {
    args: ["modal-completion-ui.mjs"],
    seconds: 37,
    browsers: ["electron"],
    reason: "Wait/Cancel dialogs and buffered pointer handoff must complete the real pending edit.",
    unit: "tool-switching.test.ts",
  },
  {
    args: ["modal-undo-boundary-ui.mjs"],
    seconds: 23,
    browsers: ["electron"],
    reason: "Native menu and keyboard Undo must stay inside a modal before document history.",
    unit: "interaction-history.test.ts",
  },
  {
    args: ["preview-fallback-ui.mjs"],
    seconds: 63,
    browsers: ["electron"],
    reason:
      "Pending/error workers must preserve drawable fallback and analytic picking without stale revival.",
    unit: "decorator-display.test.ts",
  },
  {
    args: ["transform-enter-ui.mjs"],
    seconds: 12,
    browsers: ["electron"],
    reason: "Enter must accept Transform exactly once rather than reopen the idle extrusion.",
    unit: "body-transform-enter.test.ts",
  },
  {
    args: ["reopen-operation-no-calculation-ui.mjs"],
    seconds: 6,
    browsers: ["electron"],
    reason: "Reopen must restore controls without accidentally recalculating accepted geometry.",
    unit: "reopen-preview.test.ts",
  },
  {
    args: ["reopen-operation-guards-ui.mjs"],
    seconds: 16,
    browsers: ["electron"],
    reason: "Text focus, unsupported history and host reload must guard the Reopen keyboard route.",
    unit: "reopen-operation.test.ts",
  },
  {
    args: ["reopen-operation-guard-boundaries-ui.mjs"],
    seconds: 26,
    browsers: ["electron"],
    reason: "Busy, modal and file replacement boundaries must not dispatch a stale Reopen action.",
    unit: "reopen-operation.test.ts",
  },
  {
    args: ["reopen-operation-mirror-history-ui.mjs"],
    seconds: 18,
    browsers: ["electron"],
    reason:
      "Reopen after mirrored history must populate live fields and retain the replacement Undo step.",
    unit: "reopen-parameters.test.ts",
  },
  {
    args: ["navigation-history-ui.mjs", "entry", "acceptance", "files", "interruption"],
    seconds: 60,
    browsers: ["electron"],
    reason:
      "Double-click sketch entry and input during acceptance, file replacement or interrupted navigation must respect history ownership.",
    unit: "navigation-owner.test.ts",
  },
  {
    args: ["interface-scale-electron.mjs"],
    seconds: 23,
    browsers: ["electron"],
    reason:
      "Native Settings must preserve field focus and camera coordinates when UI scale changes.",
    unit: "ui-scale-preference.test.ts",
  },
  {
    args: ["ui-demand-frames.mjs"],
    seconds: 9,
    browsers: ["electron"],
    reason: "On-demand screenshots must render fresh GPU pixels after real input and reload.",
    unit: "foreground-content.test.ts",
  },
  {
    args: ["ui-runtime-cleanup.mjs"],
    seconds: 3,
    browsers: ["electron"],
    reason: "Failed UI sessions must close the owned app, native children and temporary profile.",
    unit: "agent-process-scope.test.ts",
  },
];
