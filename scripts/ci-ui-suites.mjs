// PR UI coverage is Electron smoke + escaped integration regressions, once each.
// Exhaustive feature journeys live in ui-review-suites.mjs for targeted diagnosis.
// Add combinatorial cases to the linked lower-level tests, not this inventory.
export const uiSuites = [
  {
    args: ["surface-preview-ui.mjs"],
    // Hidden macOS Electron: 7.05s for Offset and Fillet in one app session.
    seconds: 15,
    browsers: ["electron"],
    reason:
      "Offset and Fillet must display meshes before metadata through actual controls, retain the latest numeric target, and gate acceptance through the renderer/host boundary.",
    unit: "surface-preview.test.ts",
  },
  {
    args: ["movement-preview-ui.mjs"],
    // Hidden macOS Electron: 4.59s with the captured face-movement fixture.
    seconds: 10,
    browsers: ["electron"],
    reason:
      "Face movement must draw the real mesh through IPC while metadata is pending, hide its accepted operand, and accept only the latest target; model tests cannot prove frame ordering or tool readiness.",
    unit: "movement-preview.test.ts",
  },
  {
    args: ["xray-vision-ui.mjs"],
    // macOS hidden Electron including New/XY/circle freshness: 9.18s.
    seconds: 20,
    browsers: ["electron"],
    reason:
      "A real GPU frame must keep both captures fresh after New and plane entry, and preserve normal/cut colors across the aperture, bleed, blur and resize; texture-unit state, Settings input and outside-aperture picking cannot be proven by mask math alone.",
    unit: "xray-contents.test.ts",
  },
  {
    args: ["section-distant-camera-ui.mjs"],
    // macOS hidden Electron: 6.72s.
    seconds: 15,
    browsers: ["electron"],
    reason:
      "Founder capture loses coplanar sketch ink and fill when clipping subtracts distant camera coordinates; real GPU samples catch precision errors that CPU clipping tests cannot.",
    unit: "section-pattern.test.ts",
  },
  {
    args: ["section-overlap-ui.mjs"],
    // macOS hidden Electron: 8.75s, including source-profile extrusion and chooser.
    seconds: 20,
    browsers: ["electron"],
    reason:
      "Captured caps must blend body patterns, preserve sketch ink and region hover/selection through extrusion, and offer owning bodies on a real hold; CPU geometry/style tests cannot prove GPU composition or chooser routing.",
    unit: "section-pattern.test.ts",
  },
  {
    args: ["section-fill-ui.mjs"],
    seconds: 20,
    browsers: ["electron"],
    reason:
      "GPU section caps must fill solid material without filling real holes or changing accepted geometry; section-profile unit tests cannot catch scene stencil integration errors.",
    unit: "section-pattern.test.ts",
  },
  {
    args: ["partial-section-ui.mjs"],
    // Linux run 38146139847: 23s; retain headroom for native previews and reload.
    seconds: 30,
    browsers: ["electron"],
    reason:
      "Planar selection and solid-tool previews must retain complementary GPU passes; opacity endpoint pixels catch composition errors that plane/lifetime unit tests cannot.",
    unit: "selection-section.test.ts",
  },
  {
    args: ["document-lifecycle.mjs"],
    seconds: 20,
    browsers: ["electron"],
    reason:
      "Per-window IPC, focused menus, once-per-launch startup, independent agents and canceled application Quit must preserve every document; model tests cannot exercise Electron lifecycle routing.",
    unit: "host-model-request.test.ts",
  },
  {
    args: ["primitive-handoff-ui.mjs"],
    // Linux run 38146139847: 10s; expanded viewer-side route: macOS 22.99s.
    seconds: 35,
    browsers: ["electron"],
    reason:
      "Real placement/drag must hand off to native geometry with viewer-facing depth, a frozen active axis and opposite-view reopen.",
    unit: "viewer-extrusion.test.ts",
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
    // macOS hidden Electron: 18.2s including released widget refinement and axis handoff.
    seconds: 20,
    browsers: ["electron"],
    reason:
      "Released widget values remain editable; first Tab focuses them and the next Tab accepts into the next axis. Enter accepts once; real Tab dispatch must focus sketch dimensions without starting Offset, retain single-field editing, open and highlight transform widgets, preserve invalid drafts, and accept Scale-to-Move edits separately across numeric focus handoffs.",
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
      "Native Settings must preserve field focus and camera coordinates on scale changes, and an opener during native close must not reuse the dying window.",
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
