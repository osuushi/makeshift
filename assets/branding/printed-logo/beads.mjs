import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseGcode } from "./gcode.mjs";
import { beadMesh } from "./surface.mjs";

export { beadMesh, parseGcode };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  const paths = parseGcode(readFileSync(input, "utf8"));
  const mesh = beadMesh(paths);
  const widths = paths.flatMap((path) => path.widths);
  const stats = {
    paths: paths.length,
    moves: widths.length,
    layers: new Set(paths.map((p) => p.z)).size,
    widthRange: [Math.min(...widths), Math.max(...widths)],
    vertices: mesh.vertices.length,
    faces: mesh.faces.length,
  };
  writeFileSync(output, JSON.stringify(mesh));
  writeFileSync(`${output}.stats.json`, JSON.stringify(stats, null, 2));
  console.log(stats);
}
