import { previewFaceKey } from "../decorators/preview-compositor.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Point } from "../sketch/planes.js";
import { faceRayHits, screenRay } from "./body-ray-hits.js";
import type { SelectionReveal } from "./selection-xray.js";

/** One synchronous pointer probe; never reuse across camera, clipping or document changes. */
export class BodyPickProbe {
  readonly bodies;
  readonly ray;
  private hits = new Map<string, ReturnType<typeof faceRayHits>>();
  private reveals = new Map<string, SelectionReveal | null>();

  constructor(
    private editor: SketchEditor,
    readonly screen: Point,
    bodies = editor.display.bodies,
  ) {
    this.bodies = editor.bodiesVisible
      ? (bodies ?? []).filter((body) => editor.visibility.visible(body.id))
      : [];
    this.ray = screenRay(editor, screen);
  }

  layer(body: string): number {
    return Number(this.editor.visibility.xray.has(body));
  }

  faceRevealed(body: string, face: string, screen = this.screen): boolean {
    return !this.revealAt(screen)?.faces.has(previewFaceKey(body, face));
  }

  edgeRevealed(body: string, edge: string, screen = this.screen): boolean {
    return !this.revealAt(screen)?.edges.has(previewFaceKey(body, edge));
  }

  revealAt(screen = this.screen): SelectionReveal | null {
    const key = `${screen.x},${screen.y}`;
    if (!this.reveals.has(key))
      this.reveals.set(
        key,
        this.editor.world.selectionRevealed?.(screen) ? this.editor.world.selectionXray() : null,
      );
    return this.reveals.get(key) ?? null;
  }

  faces(screen = this.screen, includeFaded = false): ReturnType<typeof faceRayHits> {
    const key = `${screen.x},${screen.y},${includeFaded}`;
    let hits = this.hits.get(key);
    if (!hits) {
      const reveal = this.revealAt(screen);
      hits = faceRayHits(
        this.bodies,
        screen === this.screen ? this.ray : screenRay(this.editor, screen),
        this.editor.world.camera.position,
        this.editor.world.clippingAt(screen),
        (body, face) => !!reveal && !reveal.faces.has(previewFaceKey(body, face)),
      ).filter((hit) => includeFaded || this.faceRevealed(hit.body, hit.face, screen));
      hits.sort((a, b) => this.layer(a.body) - this.layer(b.body) || a.depth - b.depth);
      this.hits.set(key, hits);
    }
    return hits;
  }
}

export function pickFace(editor: SketchEditor, screen: Point) {
  return new BodyPickProbe(editor, screen).faces()[0];
}
