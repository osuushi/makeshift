import { readFile } from "node:fs/promises";

const report = JSON.parse(await readFile(process.argv[2], "utf8"));
const runtimes = report.runtimes;
const names = [...new Set(runtimes.flatMap((r) => r.cases.map((c) => c.name)))];
console.log(`| Case | ${runtimes.map((r) => `${r.name} ms`).join(" | ")} | WebKit / native-1 |`);
console.log(`| --- | ${runtimes.map(() => "---:").join(" | ")} | ---: |`);
for (const name of names) {
  const cases = runtimes.map((runtime) => runtime.cases.find((c) => c.name === name));
  const native = cases[runtimes.findIndex((r) => r.name === "native-1")];
  const webkit = cases[runtimes.findIndex((r) => r.name === "webkit")];
  const ratio =
    native?.summary && webkit?.summary
      ? (webkit.summary.median / native.summary.median).toFixed(2)
      : "—";
  const value = (entry) =>
    !entry
      ? "—"
      : entry.failure
        ? "timeout/failure"
        : `${entry.summary.median.toFixed(1)}${entry.first.outcome.error ? " (rejected)" : ""}${entry.comparisons.some((c) => !c.matches) ? " DIFFERENT" : ""}`;
  console.log(`| ${name} | ${cases.map(value).join(" | ")} | ${ratio} |`);
}
for (const runtime of runtimes) {
  const failed = runtime.cases.filter((c) => c.failure);
  const rejected = runtime.cases.filter((c) => c.first?.outcome.error);
  const different = runtime.cases.filter((c) => c.comparisons.some((v) => !v.matches));
  console.log(
    `\n${runtime.name}: ${runtime.cases.length} cases, ${failed.length} harness failures/timeouts, ${rejected.length} kernel rejections, ${different.length} geometry mismatches.`,
  );
}
