import "./build-native.mjs";
import { spawn } from "node:child_process";
import electron from "electron";
import { build, createServer } from "vite";

// The optional iPad listener serves only built assets, never Vite's development endpoints.
const previousNodeEnv = process.env.NODE_ENV;
await build();
// Vite's build sets NODE_ENV; do not leak production mode into the desktop dev server.
if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = previousNodeEnv;
const server = await createServer();
await server.listen();
const compiler = spawn(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.host.json"],
  { stdio: "inherit" },
);
const code = await new Promise((resolve) => compiler.once("exit", resolve));
if (code !== 0) {
  await server.close();
  process.exit(1);
}
const child = spawn(electron, [".", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, MAKESHIFT_DEV_URL: server.resolvedUrls.local[0] },
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  child.kill();
  await server.close();
}
child.once("exit", async (code) => {
  await stop();
  process.exitCode = code ?? 0;
});
child.once("error", async (error) => {
  console.error(error);
  await stop();
  process.exitCode = 1;
});
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
