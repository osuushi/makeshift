import { previewFaceKey } from "../decorators/preview-compositor.js";
import { viewDisplay } from "../preferences/view-display.js";
import type { BodyMaskGeometry } from "../sketch/body-ellipsoid.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { BodyGeometry } from "./body.js";
import {
  includePreviewSupports,
  revealNeighborhood,
  type SelectionBody,
  selectedRevealGeometry,
  selectionPreviewGeometry,
} from "./selection-preview-geometry.js";
import type { VisualPreview } from "./visual-preview.js";

export interface SelectionReveal {
  faces: ReadonlySet<string>;
  edges: ReadonlySet<string>;
  masks: { body: string; geometry: BodyMaskGeometry }[];
}

const apertures = new WeakMap<number[], BodyMaskGeometry>();
function aperture(vertices: number[]): BodyMaskGeometry {
  let geometry = apertures.get(vertices);
  if (!geometry) {
    geometry = [vertices];
    apertures.set(vertices, geometry);
  }
  return geometry;
}

/** A stable topology neighborhood supplies the interior layer; only its aperture follows the camera. */
export class SelectionXray {
  private bodies: readonly BodyGeometry[] | undefined;
  private key = "";
  private reveal: SelectionReveal | null = null;
  private preview: VisualPreview | null = null;

  read(editor: SketchEditor): SelectionReveal | null {
    const { world, modeling, visibility } = editor;
    if (
      !editor.bodiesVisible ||
      world.activeFrame ||
      world.partialSection ||
      world.crossSection ||
      viewDisplay().bodyXrayOpacity === 1
    )
      return null;
    const bodies = editor.display.bodies;
    const preview = editor.interactions.current?.visualPreview ?? null;
    const key = `${JSON.stringify(modeling.targets)}:${bodies?.map((b) => `${b.id}:${visibility.visible(b.id)}:${visibility.xray.has(b.id)}`)}`;
    if (bodies === this.bodies && preview === this.preview && key === this.key) return this.reveal;
    this.bodies = bodies;
    this.preview = preview;
    this.key = key;
    const visible: SelectionBody[] = [
      ...(bodies ?? []).filter(
        (b) =>
          visibility.visible(b.id) &&
          !visibility.xray.has(b.id) &&
          !preview?.replaces?.includes(b.id),
      ),
      ...(preview?.bodies ?? [])
        .filter((body) =>
          body.sourceBodies?.some((id) => visibility.visible(id) && !visibility.xray.has(id)),
        )
        .map((body) => selectionPreviewGeometry(body, editor.store.data.bodies ?? [])),
    ];
    const targets = visible.flatMap((body) => {
      const faces = revealNeighborhood(body, modeling.targets);
      return faces.length ? [{ body, faces }] : [];
    });
    const retained = new Set(
      targets.flatMap(({ body, faces }) => faces.map((face) => previewFaceKey(body.id, face.id))),
    );
    const hidden = new Set(
      targets.length
        ? visible.flatMap((body) =>
            body.faces
              .map((face) => previewFaceKey(body.id, face.id))
              .filter((face) => !retained.has(face)),
          )
        : [],
    );
    includePreviewSupports(visible, hidden);
    this.reveal = hidden.size
      ? {
          faces: hidden,
          // Remove an edge only when all its incident faces are faded. Cavity rims stay visible.
          edges: new Set(
            visible.flatMap((body) =>
              body.edges
                .filter((edge) => {
                  const faces = body.faces.filter((face) => face.edges.includes(edge.id));
                  return (
                    faces.length > 0 &&
                    faces.every((face) => hidden.has(previewFaceKey(body.id, face.id)))
                  );
                })
                .map((edge) => previewFaceKey(body.id, edge.id)),
            ),
          ),
          masks: targets.flatMap(({ body }) =>
            selectedRevealGeometry(body, modeling.targets).map((geometry) => ({
              body: body.id,
              geometry: aperture(geometry),
            })),
          ),
        }
      : null;
    return this.reveal;
  }
}
