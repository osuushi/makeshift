import { pathToFileURL } from "node:url";
import { request } from "./request.js";

// Script diagnostics must not corrupt the CLI JSON result.
console.log = console.error;
let pending = false;
let failed = false;
let calls = 0;
let last: unknown = null;
async function call(command: string, entity?: string): Promise<unknown> {
  if (pending || failed || ++calls > 100) {
    failed = true;
    throw new Error("Await each view call; at most 100 calls per script.");
  }
  pending = true;
  try {
    last = await request(command, entity);
    return last;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    pending = false;
  }
}
Object.defineProperty(globalThis, "makeshift", {
  value: Object.freeze({
    settings: (patch?: unknown) =>
      call("settings", patch === undefined ? undefined : JSON.stringify(patch)),
    faces: async () => ((await call("faces")) as { faces: unknown[] }).faces,
    context: async () => ((await call("context")) as { context: unknown }).context,
    select: (ids: unknown, mode: unknown = "replace") => {
      if (
        !Array.isArray(ids) ||
        !ids.every((id) => typeof id === "string" && id.length > 0 && !id.startsWith("--")) ||
        typeof mode !== "string" ||
        !["replace", "add", "remove"].includes(mode)
      ) {
        failed = true;
        throw new Error("select expects stable IDs and replace, add or remove mode.");
      }
      if (!ids.length && mode !== "replace") return call("context");
      const args = !ids.length ? ["--clear"] : mode === "replace" ? ids : [`--${mode}`, ...ids];
      return call("select", JSON.stringify(args));
    },
  }),
});
Object.defineProperty(globalThis, "freac", { value: Reflect.get(globalThis, "makeshift") });
try {
  await import(pathToFileURL(process.argv[2]).href);
  if (pending || failed) throw new Error("View script ended with an unawaited or failed call.");
  process.stdout.write(JSON.stringify({ completed: true, result: last }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
