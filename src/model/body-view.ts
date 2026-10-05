import * as THREE from "three";
import { decoratorPreviewLayer } from "../decorators/preview-compositor.js";
import type { SketchEditor } from "../sketch/editor.js";
import { foregroundBodyLayer } from "../sketch/world-foreground.js";
import { BodyDrawable } from "./body-drawable.js";

export function bodyView(editor: SketchEditor): () => void {
  const group = new THREE.Group();
  const stats = { created: 0, disposed: 0 };
  group.userData.bodyDrawableStats = stats;
  const ambient = new THREE.HemisphereLight(0xffffff, 0x778899, 2);
  const light = new THREE.DirectionalLight(0xffffff, 2);
  for (const source of [ambient, light]) {
    source.layers.enable(foregroundBodyLayer);
    source.layers.enable(decoratorPreviewLayer);
  }
  light.position.set(40, -60, 90);
  editor.world.scene.add(group, ambient, light);
  const drawings = new Map<string, BodyDrawable>();
  const update = () => {
    const bodies = editor.display.bodies ?? [];
    const current = new Set(bodies.map((body) => body.id));
    for (const [id, drawing] of drawings) {
      if (current.has(id)) continue;
      drawing.dispose();
      group.remove(drawing.group);
      drawings.delete(id);
    }
    const selectedBodies = new Set(
      editor.modeling.targets.filter((t) => t.kind === "body").map((t) => t.body),
    );
    const selectedFaces = new Set(
      editor.modeling.targets.filter((t) => t.kind === "face").map((t) => t.face),
    );
    const selectedEdges = new Set(
      editor.modeling.targets.filter((t) => t.kind === "edge").map((t) => t.edge),
    );
    const accepted = editor.store.data.bodies ?? [];
    const hover = editor.modeling.hover;
    for (const body of bodies) {
      let drawing = drawings.get(body.id);
      if (drawing && !drawing.reuse(body)) {
        drawing.dispose();
        group.remove(drawing.group);
        drawings.delete(body.id);
        drawing = undefined;
      }
      if (!drawing) {
        drawing = new BodyDrawable(body, stats);
        drawings.set(body.id, drawing);
        group.add(drawing.group);
      }
      drawing.group.visible =
        editor.visibility.visible(body.id) &&
        (editor.bodiesVisible || !accepted.some((accepted) => accepted.id === body.id));
      drawing.style(
        selectedBodies,
        selectedFaces,
        hover?.kind === "face" ? hover.face : hover?.kind === "body" && hover.body === body.id,
        editor.world.activeFrame ?? editor.world.crossSection,
        editor.display.bodyAppearances?.find((entry) => entry.body === body.id),
        new Set(
          editor.display.decorators?.flatMap((d) =>
            d.problem ? d.faces.filter((f) => f.body === body.id).map((f) => f.face) : [],
          ),
        ),
      );
      // A finish preview can consume its source edge; preserve the accepted chain highlight.
      const source =
        editor.interactions.current?.kind === "body-edge-finish"
          ? (accepted.find((source) => source.id === body.id) ?? body)
          : body;
      drawing.highlight(source, selectedEdges, hover?.kind === "edge" ? hover.edge : undefined);
    }
  };
  editor.world.changed.add(update);
  return () => {
    editor.world.changed.delete(update);
    for (const drawing of drawings.values()) drawing.dispose();
    drawings.clear();
    editor.world.scene.remove(group, ambient, light);
  };
}
