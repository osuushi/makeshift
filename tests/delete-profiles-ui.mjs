import { deleteProfilesRoute } from "./ui-delete-profiles.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(deleteProfilesRoute, {
  allowed: ["chromium", "webkit"],
  defaults: ["chromium", "webkit"],
});
