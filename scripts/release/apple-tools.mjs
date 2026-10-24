import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

export function run(command, args, capture = false) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 35 * 60 * 1000 });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} failed (${result.status}): ${result.error?.message ?? ""}\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  if (!capture) process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  return result.stdout;
}

export function transientAppleFailure(error) {
  if (
    /invalid credentials|unauthorized|notarization[^\n]*: (?:invalid|rejected)|ticket[^\n]*(?:does not match|invalid)|invalid signature/i.test(
      String(error),
    )
  )
    return false;
  return /network connection was lost|NSURLErrorDomain[^\n]*-(?:1001|1005|1009)|timed out|temporarily unavailable|HTTP[^\n]*(?:429|502|503|504)|THROTTLED/i.test(
    String(error),
  );
}

/** Retry transport failures only; invalid signatures, credentials and tickets fail immediately. */
export async function retryApple(action, { sleep = setTimeout, warn = console.warn } = {}) {
  const delays = [5000, 15000, 45000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (!transientAppleFailure(error) || attempt === delays.length) throw error;
      warn(
        `Apple transport failed; retry ${attempt + 1}/${delays.length} in ${delays[attempt] / 1000}s: ${error}`,
      );
      await sleep(delays[attempt]);
    }
  }
}
