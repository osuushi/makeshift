// Independent ordinary-control, widget and edge families. Preserve fixture sequences.
export const uiRoutes = [
  {
    args: ["current-tools-ui.mjs", "--route=rectangleRoute"],
    seconds: 35,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=lineRoute"],
    seconds: 8,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=circleRoute"],
    seconds: 36,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=arcRoute"],
    seconds: 29,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=bezierRoute"],
    seconds: 9,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=pointLinkRoute"],
    seconds: 9,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=trimLineRoute"],
    seconds: 8,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=deleteProfilesRoute"],
    seconds: 25,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=transformRoute"],
    seconds: 24,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=extrudeRoute"],
    seconds: 15,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=normalExtrudeRoute"],
    seconds: 16,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=revolveRoute"],
    seconds: 39,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=faceOffsetRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=bodyFilletRoute"],
    seconds: 71,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=bodyChamferRoute"],
    seconds: 19,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=shellRoute"],
    seconds: 18,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=planeCutRoute"],
    seconds: 26,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=faceCutReferenceRoute"],
    seconds: 28,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=penRoute"],
    seconds: 44,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=penExtrusionRoute"],
    seconds: 12,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "extrude"],
    seconds: 27,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "axial"],
    seconds: 103,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "blend"],
    seconds: 26,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "body"],
    seconds: 32,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "topology"],
    seconds: 42,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "plane"],
    seconds: 54,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "revolve"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "planar"],
    seconds: 48,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "cards"],
    seconds: 81,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "adjacent"],
    seconds: 150,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["edge-finish-ui.mjs", "faces"],
    seconds: 59,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["edge-finish-ui.mjs", "periodic"],
    seconds: 24,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["edge-finish-ui.mjs", "motion"],
    seconds: 63,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["edge-finish-ui.mjs", "grid"],
    seconds: 17,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["edge-finish-ui.mjs", "adjacent"],
    seconds: 83,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["edge-finish-ui.mjs", "zero"],
    seconds: 49,
    browsers: ["chromium", "webkit", "electron"],
  },
];
