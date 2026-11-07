import type { SketchEditor } from "../sketch/editor.js";
import type { Point } from "../sketch/planes.js";
import { faceRayHits, screenRay } from "./body-ray-hits.js";
import { sectionKeepsBody, sectionKeepsFace } from "./section-visibility.js";

/** One synchronous pointer probe; never reuse across camera, clipping or document changes. */
export class BodyPickProbe {
  readonly bodies;
  readonly ray;
  private hits = new Map<string, ReturnType<typeof faceRayHits>>();

  constructor(
    private editor: SketchEditor,
    readonly screen: Point,
    bodies = editor.display.bodies,
  ) {
    this.bodies = editor.bodiesVisible
      ? (bodies ?? []).filter(
          (body) =>
            editor.visibility.visible(body.id) && sectionKeepsBody(body, editor.world.crossSection),
        )
      : [];
    this.ray = screenRay(editor, screen);
  }

  layer(body: string): number {
    return Number(this.editor.visibility.xray.has(body));
  }

  faces(screen = this.screen): ReturnType<typeof faceRayHits> {
    const key = `${screen.x},${screen.y}`;
    let hits = this.hits.get(key);
    if (!hits) {
      hits = faceRayHits(
        this.bodies,
        screen === this.screen ? this.ray : screenRay(this.editor, screen),
        this.editor.world.camera.position,
        this.editor.world.clippingAt(screen),
      );
      hits = hits.filter((hit) => {
        const face = this.bodies
          .find((body) => body.id === hit.body)
          ?.faces.find((face) => face.id === hit.face);
        return !!face && sectionKeepsFace(face.vertices, this.editor.world.crossSection);
      });
      hits.sort((a, b) => this.layer(a.body) - this.layer(b.body) || a.depth - b.depth);
      this.hits.set(key, hits);
    }
    return hits;
  }
}

export function pickFace(editor: SketchEditor, screen: Point) {
  return new BodyPickProbe(editor, screen).faces()[0];
}
