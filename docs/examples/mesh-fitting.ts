// Run inside an open Makeshift document: makeshift run mesh-fitting.ts
// This example supplies both a triangle target and a coarse quad layout.
type Vec = [number, number, number];
type Quad = [number, number, number, number];
const corners: Vec[] = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
const sides: Quad[] = [
  [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
  [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
];
function sphereGrid(resolution: number) {
  const vertices: Vec[] = [], quads: Quad[] = [];
  const shared = new Map<string, number>();
  for (const face of sides) {
    const grid: number[][] = [];
    for (let i = 0; i <= resolution; ++i) {
      grid[i] = [];
      for (let j = 0; j <= resolution; ++j) {
        const u = i / resolution, v = j / resolution;
        const p = [0, 1, 2].map((axis) =>
          corners[face[0]][axis] * (1-u) * (1-v) + corners[face[1]][axis] * u * (1-v) +
          corners[face[2]][axis] * u * v + corners[face[3]][axis] * (1-u) * v,
        ) as Vec;
        const key = p.map((value) => value.toFixed(10)).join(",");
        let id = shared.get(key);
        if (id === undefined) {
          id = vertices.length;
          shared.set(key, id);
          vertices.push(p.map((value) => 10 * value / Math.hypot(...p)) as Vec);
        }
        grid[i][j] = id;
      }
    }
    for (let i = 0; i < resolution; ++i) for (let j = 0; j < resolution; ++j)
      quads.push([grid[i][j], grid[i+1][j], grid[i+1][j+1], grid[i][j+1]]);
  }
  return { vertices, quads };
}
const target = sphereGrid(20);
const fitted = await makeshift.fitMesh({
  mesh: {
    vertices: target.vertices,
    triangles: target.quads.flatMap(([a,b,c,d]) => [[a,b,c], [a,c,d]] as [number,number,number][]),
  },
  layout: sphereGrid(1),
  tolerance: 0.15,
  smoothAngle: 5,
  maxPatches: 96,
});
console.log(fitted.fit);
