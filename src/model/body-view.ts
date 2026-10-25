import * as THREE from "three";
import { decoratorPreviewLayer } from "../decorators/preview-compositor.js";
import type { SketchEditor } from "../sketch/editor.js";
import { foregroundBodyLayer } from "../sketch/world-foreground.js";
import { BodyDrawable } from "./body-drawable.js";
import { SectionStyleSeeds } from "./section-pattern.js";
import { visualPreviewView } from "./visual-preview-view.js";

function bodyLights(): THREE.Light[] {
  const ambient = new THREE.HemisphereLight(0xffffff, 0x778899, 2);
  const light = new THREE.DirectionalLight(0xffffff, 2);
  for (const source of [ambient, light]) {
    source.layers.enable(foregroundBodyLayer);
    source.layers.enable(decoratorPreviewLayer);
  }
  light.position.set(40, -60, 90);
  return [ambient, light];
}

export function bodyView(editor: SketchEditor): () => void {
  const disposeVisual = visualPreviewView(editor);
  const group = new THREE.Group();
  const stats = { created: 0, disposed: 0 };
  group.userData.bodyDrawableStats = stats;
  const lights = bodyLights();
  editor.world.scene.add(group, ...lights);
  const drawings = new Map<string | number, BodyDrawable>();
  const sectionSeeds = new SectionStyleSeeds();
  const update = () => {
    const bodies = editor.display.bodies ?? [];
    const accepted = editor.store.data.bodies ?? [];
    const kind = editor.candidate ? (editor.interactions.current?.kind ?? null) : null;
    // New temporary bodies have fresh model IDs on every calculation. A local
    // display slot can keep their materials without claiming model continuity.
    const drawingKey = (body: (typeof bodies)[number], index: number) =>
      kind && !accepted.some((source) => source.id === body.id) ? index : body.id;
    const current = new Set(bodies.map(drawingKey));
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
    const hover = editor.modeling.hover;
    for (const [index, body] of bodies.entries()) {
      const key = drawingKey(body, index);
      let drawing = drawings.get(key);
      if (drawing && !drawing.reuse(body)) {
        drawing.dispose();
        group.remove(drawing.group);
        drawings.delete(key);
        drawing = undefined;
      }
      if (!drawing) {
        drawing = new BodyDrawable(body, stats);
        drawings.set(key, drawing);
        group.add(drawing.group);
      }
      // Newly created candidates get fresh model IDs on each computation. Hold
      // their presentation seed through the gesture, then use accepted identity.
      drawing.group.userData.sectionStyleKey = sectionSeeds.forBody(
        kind,
        index,
        body.id,
        accepted.some((source) => source.id === body.id),
      );
      drawing.group.visible =
        editor.visibility.visible(body.id) &&
        (editor.bodiesVisible || !accepted.some((accepted) => accepted.id === body.id));
      drawing.style(
        selectedBodies,
        selectedFaces,
        hover?.kind === "face" ? hover.face : hover?.kind === "body" && hover.body === body.id,
        editor.world.partialSection ?? editor.world.crossSection,
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
    disposeVisual();
    editor.world.changed.delete(update);
    for (const drawing of drawings.values()) drawing.dispose();
    drawings.clear();
    editor.world.scene.remove(group, ...lights);
  };
}
