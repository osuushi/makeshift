import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cases } from "./cases.mjs";
import { Client } from "./client.mjs";

const client = new Client(resolve(process.argv[2] ?? ".build/kernel/bin/makeshift-kernel"), 4);
const output = process.argv[3] ?? "docs/research/geometry-performance/results";
const selected = new Set([
  "circle-offset-twist",
  "shell-bent-sweep-captured",
  "shell-notched-cylinder-captured",
]);
try {
  const inputs = await cases(client);
  for (const [name, input] of inputs.filter(([name]) => selected.has(name))) {
    const { reply } = await client.request(input);
    if (reply.error || reply.results.length !== 1)
      throw new Error(`${name}: ${reply.error ?? "Unexpected results"}`);
    const result = reply.results[0];
    await writeFile(`${output}/${name}.brep`, Buffer.from(result.brep, "hex"));
    await writeFile(
      `${output}/${name}-reference.json`,
      `${JSON.stringify(
        {
          name,
          volume: result.volume,
          center: result.center,
          bounds: result.bounds,
          faces: result.faces.length,
          edges: result.edges.length,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`${name} ${result.volume} mm3`);
  }
} finally {
  await client.close();
}
