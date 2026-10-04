import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { ScriptApi, ScriptOperation, ScriptRequest } from "../agent-script/api.js";
import { compileScript } from "./compile-script.js";
import { request } from "./request.js";

export async function runScript(path: string): Promise<unknown> {
  const directory = await mkdtemp(join(tmpdir(), "makeshift-script-"));
  let token: string | undefined;
  const send = (action: ScriptRequest["action"], operation?: ScriptOperation) =>
    request("script", undefined, { action, token, operation });
  try {
    const entry = await compileScript(path, directory);
    const started = (await request("script", undefined, {
      action: "begin",
      name: basename(path),
    })) as {
      token: string;
      selection: ScriptApi["selection"];
    };
    token = started.token;
    await executeScript(entry, started.selection, send);
    const result = await send("finish");
    token = undefined;
    return result;
  } catch (error) {
    if (token) {
      const message = error instanceof Error ? error.message : String(error);
      await request("script", undefined, {
        action: "cancel",
        token,
        error: message === "Script interrupted" ? undefined : message.slice(0, 2000),
      }).catch(() => {});
      token = undefined;
    }
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function executeScript(
  entry: string,
  selection: ScriptApi["selection"],
  send: (action: ScriptRequest["action"], operation?: ScriptOperation) => Promise<unknown>,
): Promise<void> {
  const child = fork(new URL("./script-worker.js", import.meta.url), [entry], {
    stdio: ["ignore", 2, 2, "ipc"],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    execArgv: [],
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  let timer: ReturnType<typeof setInterval> | undefined;
  let terminate: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      let polling = false;
      let operation: Promise<unknown> | undefined;
      const fail = (error: unknown) =>
        reject(error instanceof Error ? error : new Error(String(error)));
      terminate = () => fail(new Error("Script interrupted"));
      process.once("SIGINT", terminate);
      process.once("SIGTERM", terminate);
      process.once("SIGHUP", terminate);
      timer = setInterval(() => {
        if (polling) return;
        polling = true;
        void send("poll")
          .catch((error) => {
            // Session cleanup can beat the failed step's response. Preserve that
            // operation's error; a successful step still cannot hide a lost runner.
            if (operation) void operation.then(() => fail(error), fail);
            else fail(error);
          })
          .finally(() => {
            polling = false;
          });
      }, 1000);
      child.once("error", fail);
      child.once("exit", () => fail(new Error("Script process exited before completion")));
      child.on(
        "message",
        (message: { kind: string; operation?: ScriptOperation; error?: string }) => {
          if (message.kind === "done") resolve();
          else if (message.kind === "error") fail(new Error(message.error));
          else if (message.kind === "operation") {
            const active = send("step", message.operation);
            operation = active;
            void active.then(
              (value) => {
                if (operation === active) operation = undefined;
                if (child.connected) child.send({ kind: "reply", value });
              },
              (error) => {
                if (operation === active) operation = undefined;
                fail(error);
              },
            );
          }
        },
      );
      child.send({ kind: "start", selection });
    });
  } finally {
    clearInterval(timer);
    if (terminate) {
      process.removeListener("SIGINT", terminate);
      process.removeListener("SIGTERM", terminate);
      process.removeListener("SIGHUP", terminate);
    }
    child.kill("SIGKILL");
    await closed;
  }
}
