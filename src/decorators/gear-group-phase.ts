import type { DisplayDocument } from "../model/display-document.js";
import { gearContact } from "./gear-group-geometry.js";
import { gearSettings, radians } from "./gear-settings.js";
import type { DecoratorInstance } from "./types.js";

export function alignGearPhases(document: DisplayDocument, members: DecoratorInstance[]) {
  const result = [...members],
    visited = new Set<number>();
  for (let root = 0; root < result.length; root++) {
    if (visited.has(root)) continue;
    visited.add(root);
    const queue = [root];
    for (const i of queue) {
      for (let j = 0; j < result.length; j++) {
        if (i === j) continue;
        const contact = gearContact(document, result[i], result[j]);
        if (!contact) continue;
        const a = gearSettings(result[i].settings),
          b = gearSettings(result[j].settings);
        const turnA = (a.teeth * (contact.a - radians(a.phase))) / (2 * Math.PI);
        const turnB =
          (contact.meshSign === 1 ? 0.5 : 0) - contact.meshSign * contact.orientation * turnA;
        const phase = contact.b - (2 * Math.PI * turnB) / b.teeth;
        if (visited.has(j)) {
          const residual = (b.teeth * (phase - radians(b.phase))) / (2 * Math.PI);
          if (Math.abs(residual - Math.round(residual)) > 1e-6)
            throw new Error("This gear loop cannot mesh at every contact. Change the arrangement.");
        } else {
          result[j] = {
            ...result[j],
            settings: { ...b, phase: ((((phase * 180) / Math.PI) % 360) + 360) % 360 },
          };
          visited.add(j);
          queue.push(j);
        }
      }
    }
  }
  return result;
}
