import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { DisplayDocument } from "../model/display-document.js";
import { viewportPalette } from "../preferences/viewport-theme.js";
import { constraintCurves, visibleConstraints } from "./constraint-geometry.js";
import type { SketchEditor } from "./editor.js";
import { worldPoint } from "./planes.js";
import { coloredCurve, pointFeedback } from "./point-colors.js";
import { stableClipping } from "./stable-clipping.js";

export function drawSketches(editor: SketchEditor, obscured = false): () => void {
  const disposeObscured = obscured ? null : drawSketches(editor, true);
  const material = new LineMaterial({
    linewidth: 2,
    vertexColors: true,
    depthTest: true,
    depthFunc: obscured ? THREE.GreaterDepth : THREE.LessEqualDepth,
    transparent: obscured,
    opacity: obscured ? 0.3 : 1,
    depthWrite: false,
    // Preserve visible sketch samples when the later section-cap pass fills the cut.
    stencilWrite: !obscured,
    stencilRef: 16,
    stencilWriteMask: 16,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  stableClipping(material);
  let geometry = new LineSegmentsGeometry(),
    lines = new LineSegments2(geometry, material);
  editor.world.scene.add(lines);
  lines.renderOrder = 10;
  let previous: DisplayDocument | null = null,
    selection = "";
  const update = () => {
    const selected = editor.selectionOwners;
    const hover = new Set(editor.hover?.kind === "curve" ? [editor.hover.curve] : []);
    const rect = editor.world.canvas.getBoundingClientRect();
    const modeling = !editor.world.active
      ? editor.modeling.targets.filter((t) => t.kind === "sketch").map((t) => t.sketch)
      : [];
    const mergeable = !editor.world.active
      ? editor.mergeableSketches.map((sketch) => sketch.id)
      : [];
    const key = `${viewportPalette().background}:${editor.visibility.key}:${modeling.join()}:${mergeable.join()}:${editor.modeling.hover?.sketch}:${[...selected].sort().join(",")}:${[...editor.selectedCurves].join(",")}:${[...hover].join(",")}:${editor.constraintHover}:${editor.selected.firstPointKey}:${[...(editor.selected.pointKeys ?? [])].join()}:${JSON.stringify(editor.pointHover)}:${editor.world.active}:${editor.world.height}:${rect.height}`;
    material.resolution.set(rect.width, rect.height);
    if (previous !== editor.display || selection !== key) {
      const { positions, colors } = sketchSegments(
        editor,
        selected,
        hover,
        modeling,
        new Set(mergeable),
        obscured,
      );
      geometry.dispose();
      editor.world.scene.remove(lines);
      geometry = new LineSegmentsGeometry();
      if (positions.length) {
        geometry.setPositions(positions);
        geometry.setColors(colors);
      }
      lines = new LineSegments2(geometry, material);
      lines.visible = positions.length > 0;
      lines.renderOrder = 10;
      editor.world.scene.add(lines);
      previous = editor.display;
      selection = key;
    }
  };
  editor.world.changed.add(update);
  update();
  return () => {
    disposeObscured?.();
    editor.world.changed.delete(update);
    geometry.dispose();
    material.dispose();
    editor.world.scene.remove(lines);
  };
}

function sketchSegments(
  editor: SketchEditor,
  selected: Set<string>,
  hover: Set<string>,
  modeling: string[],
  mergeable: Set<string>,
  obscured: boolean,
) {
  const positions: number[] = [],
    colors: number[] = [];
  for (const sketch of editor.display.sketches) {
    if (!editor.visibility.visible(sketch.id)) continue;
    if (obscured && !modeling.includes(sketch.id)) continue;
    const feedback = pointFeedback(editor, sketch);
    const locks = visibleConstraints(sketch);
    const constrained = new Set(locks.flatMap(constraintCurves));
    const hoveredConstraint = locks.find((c) => c.id === editor.constraintHover);
    const highlight = new Set(hoveredConstraint ? constraintCurves(hoveredConstraint) : []);
    for (const curve of sketch.curves) {
      const color = new THREE.Color(
        hover.has(curve.id) ||
          highlight.has(curve.id) ||
          (!editor.world.active &&
            editor.modeling.hover?.sketch === sketch.id &&
            editor.modeling.hover.kind === "sketch")
          ? viewportPalette().hover
          : modeling.includes(sketch.id) ||
              editor.selectedCurves.has(curve.id) ||
              (selected.has(curve.id) && !feedback.affected.has(curve.id))
            ? viewportPalette().selected
            : mergeable.has(sketch.id)
              ? viewportPalette().hover
              : editor.world.active && sketch.id !== editor.sketch?.id
                ? viewportPalette().inactive
                : constrained.has(curve.id)
                  ? viewportPalette().constrained
                  : viewportPalette().ink,
      );
      const rendered = coloredCurve(
        curve,
        editor.world.height / editor.world.canvas.clientHeight,
        color,
        highlight.has(curve.id) ? [] : feedback.selected,
        highlight.has(curve.id) ? [] : feedback.hovered,
      );
      const points = rendered.points;
      for (let i = 1; i < points.length; i++) {
        positions.push(
          ...worldPoint(sketch.plane, points[i - 1]),
          ...worldPoint(sketch.plane, points[i]),
        );
        const a = rendered.colors[i - 1],
          b = rendered.colors[i];
        colors.push(a.r, a.g, a.b, b.r, b.g, b.b);
      }
    }
  }

  return { positions, colors };
}
