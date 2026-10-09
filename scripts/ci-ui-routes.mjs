// Independent ordinary-control, widget and edge families. Preserve fixture sequences.
export const uiRoutes = [
  {
    args: ["current-tools-ui.mjs", "--route=rectangleRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=lineRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=circleRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=arcRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=bezierRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=pointLinkRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=trimLineRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=deleteProfilesRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=transformRoute"],
    seconds: 30,
    browsers: ["chromium", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=extrudeRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=normalExtrudeRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=revolveRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=faceOffsetRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=bodyFilletRoute"],
    seconds: 55,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=bodyChamferRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=shellRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=planeCutRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=faceCutReferenceRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=penRoute"],
    seconds: 75,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["current-tools-ui.mjs", "--route=penExtrusionRoute"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "extrude"],
    seconds: 25,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "axial"],
    seconds: 105,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "blend"],
    seconds: 25,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "body"],
    seconds: 35,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "topology"],
    seconds: 45,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "plane"],
    seconds: 60,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "revolve"],
    seconds: 30,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "planar"],
    seconds: 45,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "cards"],
    seconds: 80,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["widget-reachability-ui.mjs", "adjacent"],
    seconds: 165,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["edge-finish-ui.mjs", "faces"],
    seconds: 60,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["edge-finish-ui.mjs", "periodic"],
    seconds: 10,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["edge-finish-ui.mjs", "motion"],
    seconds: 80,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["edge-finish-ui.mjs", "grid"],
    seconds: 20,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["edge-finish-ui.mjs", "adjacent"],
    seconds: 85,
    browsers: ["chromium", "webkit", "electron"],
  },
  {
    args: ["edge-finish-ui.mjs", "zero"],
    seconds: 55,
    browsers: ["chromium", "webkit", "electron"],
  },
];
