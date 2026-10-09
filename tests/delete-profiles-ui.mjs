import { deleteProfilesRoute } from "./ui-delete-profiles.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(deleteProfilesRoute, {
  allowed: ["chromium", "webkit", "electron"],
  defaults: ["chromium", "webkit"],
});
