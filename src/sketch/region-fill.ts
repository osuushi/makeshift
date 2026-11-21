import * as THREE from "three";
import type { ProfileEditView } from "../model/revolved-profile.js";
import { colorTheme } from "../preferences/theme.js";
import { boundaryPoints, type CurveSpan } from "./curve-spans.js";
import type { Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { type PlaneFrame, type Point, worldPoint } from "./planes.js";
import type { Profile } from "./profiles.js";
import { regionGridCoordinates, regionMaterial } from "./region-material.js";
import { closedBoundaries } from "./regions.js";
import type { World } from "./world.js";

// Base tint and modeling hover/selection fills share one post-section pass.
export const sketchFillLayer = 5;

type RegionBoundary = Pick<Profile, "outer" | "holes">;

function sketchBoundaries(sketch: Sketch, profile?: ProfileEditView): RegionBoundary[] {
  if (sketch.id === profile?.sketch.id) return profile.region ? [profile.region] : [];
  return closedBoundaries(sketch.curves).map((outer) => ({ outer, holes: [] }));
}

function triangles({ outer, holes }: RegionBoundary, scale: number): Point[] {
  const vertices = (boundary: CurveSpan[]) =>
    boundaryPoints(boundary, scale).map(({ x, y }) => new THREE.Vector2(x, y));
  const contour = vertices(outer),
    openings = holes.map(vertices);
  const faces = THREE.ShapeUtils.triangulateShape(contour, openings);
  const points = [...contour, ...openings.flat()];
  return faces.flatMap((face) => face.map((index) => points[index]));
}

/** A stencil union keeps overlapping/nested closed cells at one translucent tint. */
export function drawRegionFills(editor: SketchEditor): () => void {
  const material = regionMaterial(0.14, {
    opacity: 0.28,
    stencilWrite: true,
    stencilRef: 0,
    stencilWriteMask: 1,
    // Union the tint once, preserving already drawn sketch ink samples (bit 16).
    stencilFuncMask: 17,
    stencilFunc: THREE.EqualStencilFunc,
    stencilZPass: THREE.InvertStencilOp,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.renderOrder = 5;
  editor.world.scene.add(mesh);
  const disposeFillPass = installRegionFillPass(editor.world, mesh);
  let previous: readonly Sketch[] | null = null,
    previousProfile: string | undefined,
    previousRegion: Profile | undefined,
    previousScale = 0,
    previousTheme = "",
    visibility = "";
  let regions: { plane: PlaneFrame; boundaries: RegionBoundary[] }[] = [];
  const update = () => {
    const scale = editor.world.height / editor.world.canvas.clientHeight;
    const theme = colorTheme();
    const profile = editor.store.profileEdit;
    const profileId = profile?.sketch.id,
      region = profile?.region;
    const changed =
      previous !== editor.display.sketches ||
      visibility !== editor.visibility.key ||
      previousProfile !== profileId ||
      previousRegion !== region;
    if (!changed && previousScale === scale && previousTheme === theme) return;
    if (changed) {
      regions = editor.display.sketches
        .filter((s) => editor.visibility.visible(s.id))
        .map((sketch) => ({
          plane: sketch.plane,
          boundaries: sketchBoundaries(sketch, profile),
        }));
    }
    previousProfile = profileId;
    previousRegion = region;
    visibility = editor.visibility.key;
    previous = editor.display.sketches;
    previousScale = scale;
    mesh.material.color.set(theme === "dark" ? "#b4b4b4" : "#656565");
    previousTheme = theme;
    const positions: number[] = [],
      coordinates: number[] = [];
    for (const { plane, boundaries } of regions) {
      const gridCoordinates = regionGridCoordinates(plane, scale);
      for (const boundary of boundaries) {
        for (const point of triangles(boundary, scale)) {
          const position = worldPoint(plane, point);
          positions.push(...position);
          coordinates.push(...gridCoordinates(position));
        }
      }
    }
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BufferGeometry();
    mesh.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    mesh.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(coordinates, 2));
    mesh.visible = positions.length > 0;
  };
  editor.world.changed.add(update);
  update();
  return () => {
    editor.world.changed.delete(update);
    disposeFillPass();
    editor.world.scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
  };
}

function installRegionFillPass(world: World, mesh: THREE.Mesh): () => void {
  mesh.layers.set(sketchFillLayer);
  // Keep fills in the scene for grid-veil configuration. Render base tint first,
  // then hover/selection (renderOrder 6), after caps and before the front composite.
  const render = () => {
    if (!mesh.visible) return;
    const { renderer, scene, camera } = world;
    const layers = camera.layers.mask;
    const background = scene.background;
    const autoClear = renderer.autoClear;
    try {
      camera.layers.set(sketchFillLayer);
      scene.background = null;
      renderer.autoClear = false;
      renderer.render(scene, camera);
    } finally {
      camera.layers.mask = layers;
      scene.background = background;
      renderer.autoClear = autoClear;
    }
  };
  world.renderOverlays.add(render);
  return () => world.renderOverlays.delete(render);
}
