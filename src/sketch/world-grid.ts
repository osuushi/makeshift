import * as THREE from "three";
import { canonicalPlanes } from "../preferences/canonical-planes.js";
import { viewDisplay } from "../preferences/view-display.js";
import { planeViewCenter } from "./canonical-plane-bounds.js";
import type { CanonicalPlaneVisibility } from "./canonical-plane-visibility.js";
import { type PlaneFrame, planeIds, planes } from "./planes.js";
import { createWorldAxes } from "./world-axes.js";
import { gridMaterial } from "./world-grid-material.js";

export function createGrids(scene: THREE.Scene) {
  const axes = createWorldAxes(scene);
  const grids = [...planeIds, "work" as const].map((id) => createGrid(scene, id));
  return {
    update(
      camera: THREE.Camera,
      target: THREE.Vector3,
      height: number,
      active: PlaneFrame | null,
      viewportHeight: number,
      visibility: CanonicalPlaneVisibility["states"],
    ) {
      axes.update(camera, target, height);
      const direction = camera.getWorldDirection(new THREE.Vector3());
      const spacing = gridSpacing(height, viewportHeight);
      const canonicalSketch =
        active &&
        planeIds.find((id) =>
          (["origin", "u", "v"] as const).every((field) =>
            planes[id][field].every((value, index) => value === active[field][index]),
          ),
        );
      for (const grid of grids) {
        if (grid.id === "work") {
          grid.mesh.visible = !!active;
          if (!active) continue;
          grid.u.set(...active.u);
          grid.v.set(...active.v);
          grid.normal.copy(grid.u).cross(grid.v);
          grid.mesh.position.set(...active.origin);
          grid.mesh.setRotationFromMatrix(
            new THREE.Matrix4().makeBasis(grid.u, grid.v, grid.normal),
          );
        }
        grid.material.uniforms.gridColor.value.set(
          grid.id === "work"
            ? canonicalSketch
              ? canonicalPlanes().colors[canonicalSketch]
              : "#758296"
            : canonicalPlanes().colors[grid.id],
        );
        grid.material.uniforms.coordinateDepthDistance.value = height * 2.5;
        grid.material.uniforms.coordinateViewCenter.value.copy(target);
        grid.material.uniforms.coordinateViewDirection.value.copy(direction);
        const facing = Math.abs(direction.dot(grid.normal));
        grid.material.uniforms.spacing.value = spacing;
        grid.material.uniforms.lineWidth.value = viewDisplay().gridLineWidth;
        grid.material.uniforms.opacityScale.value =
          (viewDisplay().grid / 0.4) * (grid.id === "work" ? 1 : visibility[grid.id].opacity);
        grid.material.uniforms.strength.value =
          grid.id === "work" ? 0.4 * Math.min(1, facing * 5) : 0.22;
        const frame = grid.id === "work" ? active : planes[grid.id];
        if (!frame) continue;
        const center = planeViewCenter(camera, target, frame);
        const x = center.dot(grid.u),
          y = center.dot(grid.v);
        const aspect =
          camera instanceof THREE.OrthographicCamera
            ? (camera.right - camera.left) / (camera.top - camera.bottom)
            : 1;
        const extent = (4 * height * Math.max(1, aspect)) / Math.max(0.001, facing);
        grid.material.uniforms.radius.value = (height * 1.15) / Math.max(0.001, facing);
        grid.material.uniforms.extent.value = extent;
        grid.material.uniforms.center.value.set(x, y);
        grid.mesh.position
          .set(...frame.origin)
          .addScaledVector(grid.u, x)
          .addScaledVector(grid.v, y);
        grid.mesh.scale.set(extent, extent, 1);
        grid.mesh.visible =
          grid.id === "work"
            ? facing > 0.005
            : !active && facing > 1e-8 && visibility[grid.id].opacity > 0;
      }
      return spacing;
    },
    dispose() {
      axes.dispose();
      for (const { mesh, material } of grids) {
        mesh.geometry.dispose();
        material.dispose();
        scene.remove(mesh);
      }
    },
  };
}

function createGrid(scene: THREE.Scene, id: (typeof planeIds)[number] | "work") {
  const frame = id === "work" ? planes.XY : planes[id];
  const u = new THREE.Vector3(...frame.u);
  const v = new THREE.Vector3(...frame.v);
  const normal = u.clone().cross(v);
  const material = gridMaterial(id);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(u, v, normal));
  // The active sketch plane stays legible over bodies, fills and highlights.
  mesh.renderOrder = id === "work" ? 100 : -10;
  scene.add(mesh);
  return { id, mesh, normal, u, v, material };
}

function gridSpacing(height: number, viewportHeight: number): number {
  // Keep squares near 32 CSS pixels with familiar decimal snap increments.
  // Geometric midpoints select the closest step by proportional screen size.
  const desired = (32 * height) / Math.max(1, viewportHeight);
  const decade = 10 ** Math.floor(Math.log10(desired));
  const fraction = desired / decade;
  const step =
    fraction < Math.sqrt(2) ? 1 : fraction < Math.sqrt(10) ? 2 : fraction < Math.sqrt(50) ? 5 : 10;
  return step * decade;
}
