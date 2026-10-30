import type { DisplayDocument } from "../model/display-document.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { resolveFaces } from "./cylinder.js";
import { threadReference } from "./thread-extent.js";
import { type ThreadSettings, threadSettings } from "./thread-settings.js";
import type { DecoratorInstance, FaceReference } from "./types.js";

export interface ThreadNormalParameters {
  frame: PlaneFrame;
  radius: number;
  outward: 1 | -1;
  settings: ThreadSettings;
  bounds: [number, number];
}
export interface PackedThreadTexture extends FaceReference {
  kind: "thread";
  positions: Float32Array;
  parameters: ThreadNormalParameters;
}

/** Threads own an analytic normal function; no tessellated thread or normal-map bake is needed. */
export function threadTexture(
  document: DisplayDocument,
  instance: DecoratorInstance,
): PackedThreadTexture[] {
  const faces = resolveFaces(document.bodies ?? [], instance.faces);
  const settings = threadSettings(instance.settings);
  const reference = threadReference(document.bodies ?? [], instance);
  const bounds: [number, number] = [reference[0] + settings.start, reference[1] - settings.end];
  return faces.map((face, index) => ({
    ...instance.faces[index],
    kind: "thread",
    positions: new Float32Array(face.vertices),
    parameters: {
      frame: instance.frame,
      radius: face.cylinder.radius,
      outward: face.cylinder.outward,
      settings,
      bounds,
    },
  }));
}
