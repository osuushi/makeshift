export interface GearContactDistance {
  a: number;
  b: number;
  distance: number;
}
export interface GearFit {
  module: number;
  counts: number[];
  error: number;
}
type CountCost = (index: number, count: number, module: number) => number | null;

/** A contacting pair fixes module from its integer tooth-count sum (12..800).
 * Propagate those integer sums through each contact component, including loops. */
export function fitContactingGears(
  diameters: number[],
  contacts: GearContactDistance[],
  maximum: number,
  tolerance: number,
  cost: CountCost,
): GearFit | null {
  let best: GearFit | null = null;
  for (let sum = 12; sum <= 800; sum++) {
    const module = (2 * contacts[0].distance) / sum;
    if (module > maximum + 1e-10) continue;
    const solution = countsAtModule(diameters, contacts, module, tolerance, cost);
    if (
      solution &&
      (!best ||
        solution.error < best.error - 1e-12 ||
        (Math.abs(solution.error - best.error) <= 1e-12 && module > best.module))
    )
      best = solution;
  }
  return best;
}

function countsAtModule(
  diameters: number[],
  contacts: GearContactDistance[],
  module: number,
  tolerance: number,
  cost: CountCost,
): GearFit | null {
  const counts: number[] = Array(diameters.length).fill(0);
  let total = 0;
  for (let root = 0; root < diameters.length; root++) {
    if (counts[root]) continue;
    const low = Math.max(6, Math.ceil((diameters[root] - tolerance - 1e-8) / module));
    const high = Math.min(400, Math.floor((diameters[root] + tolerance + 1e-8) / module));
    let best: { values: Map<number, number>; error: number } | null = null;
    for (let count = low; count <= high; count++) {
      if (cost(root, count, module) === null) continue;
      const values = propagate(root, count, contacts, module);
      if (!values) continue;
      let error = 0;
      for (const [index, n] of values) {
        const value = cost(index, n, module);
        if (value === null) {
          error = Infinity;
          break;
        }
        error += value;
      }
      if (Number.isFinite(error) && (!best || error < best.error)) best = { values, error };
    }
    if (!best) return null;
    for (const [index, count] of best.values) counts[index] = count;
    total += best.error;
  }
  return { module, counts, error: total };
}

function propagate(root: number, count: number, contacts: GearContactDistance[], module: number) {
  const values = new Map([[root, count]]),
    queue = [root];
  for (const index of queue) {
    for (const edge of contacts) {
      const neighbor = edge.a === index ? edge.b : edge.b === index ? edge.a : -1;
      if (neighbor < 0) continue;
      const sum = (2 * edge.distance) / module;
      if (Math.abs(sum - Math.round(sum)) > 1e-7) return null;
      const n = Math.round(sum) - (values.get(index) ?? 0);
      if (n < 6 || n > 400) return null;
      if (values.has(neighbor)) {
        if (values.get(neighbor) !== n) return null;
      } else {
        values.set(neighbor, n);
        queue.push(neighbor);
      }
    }
  }
  return values;
}
