import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { NativeCalculator } from "../src/backend/native-calculator.js";

async function calculator(deadline = 3000) {
  const dir = await mkdtemp(join(tmpdir(), "makeshift-calculator-"));
  const executable = join(dir, "calculator.mjs");
  const ready = join(dir, "ready");
  await writeFile(
    executable,
    `#!${process.execPath}
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
process.on('SIGTERM', () => {});
createInterface({input: process.stdin}).on('line', line => {
  const input = JSON.parse(line);
  if (input.stall) {
    writeFileSync(${JSON.stringify(ready)}, String(process.pid));
    setTimeout(() => console.log(JSON.stringify({late: true})), 1500);
  } else if (input.error !== undefined) console.log(JSON.stringify({error: input.error}));
  else console.log(JSON.stringify({pid: process.pid}));
});
`,
  );
  await chmod(executable, 0o755);
  const native = new NativeCalculator<{ stall?: boolean; error?: string }, { pid: number }>(
    executable,
    "Test kernel",
    deadline,
  );
  return { native, ready, dir };
}
async function started(path: string): Promise<number> {
  for (let i = 0; i < 200; i++) {
    try {
      return Number(await readFile(path, "utf8"));
    } catch {
      await delay(10);
    }
  }
  throw new Error("Test calculator did not start");
}
function dead(pid: number) {
  assert.throws(() => process.kill(pid, 0), /ESRCH/);
}

test("native cancellation kills an uncooperative process, drains it and restarts without replay", {
  skip: process.platform === "win32",
}, async () => {
  const { native, ready, dir } = await calculator();
  try {
    const pending = native.calculate({ stall: true });
    const rejected = assert.rejects(pending, /^Error: Native calculation cancelled$/);
    const pid = await started(ready);
    await assert.rejects(native.calculate({}), /busy/);
    const begin = performance.now();
    await native.cancel();
    await rejected;
    assert.ok(performance.now() - begin < 1000);
    dead(pid);
    const next = await native.calculate({});
    assert.notEqual(next.pid, pid);
  } finally {
    native.close();
    await native.cancel();
    await rm(dir, { recursive: true });
  }
});

test("native deadline is distinct from cancellation and a subsequent calculation waits for termination", {
  skip: process.platform === "win32",
}, async () => {
  const { native, ready, dir } = await calculator(600);
  try {
    const pending = native.calculate({ stall: true });
    const rejected = assert.rejects(pending, /Test kernel timed out after 0.6 seconds/);
    const pid = await started(ready);
    await rejected;
    const next = await native.calculate({});
    dead(pid);
    assert.notEqual(next.pid, pid);
  } finally {
    native.close();
    await native.cancel();
    await rm(dir, { recursive: true });
  }
});

test("cancellation also discards a request waiting for an old process to exit", {
  skip: process.platform === "win32",
}, async () => {
  const { native, ready, dir } = await calculator(600);
  try {
    const rejected = assert.rejects(native.calculate({ stall: true }), /timed out/);
    await started(ready);
    await rejected;
    const next = assert.rejects(native.calculate({}), /cancelled/);
    await native.cancel();
    await next;
    assert.ok((await native.calculate({})).pid > 0);
  } finally {
    native.close();
    await native.cancel();
    await rm(dir, { recursive: true });
  }
});

test("native error replies remain errors even when their diagnostic is empty", async () => {
  const { native, dir } = await calculator();
  try {
    for (const error of ["", "Undefined normal"]) {
      await assert.rejects(native.calculate({ error }), (failure: Error) => {
        assert.equal(failure.message, error || "Test kernel calculation failed");
        assert.deepEqual(failure.cause, { error });
        return true;
      });
    }
    assert.ok((await native.calculate({})).pid > 0);
  } finally {
    native.close();
    await native.cancel();
    await rm(dir, { recursive: true });
  }
});
