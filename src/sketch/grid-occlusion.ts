import * as THREE from "three";
import { gridFillGradient, gridFillGradientFragment } from "./grid-fill-gradient.js";
import type { World } from "./world.js";

/** Complete the grid veil for translucent objects drawn after the grid itself. */
export class GridOcclusion {
  private readonly installed = new WeakMap<THREE.Material, { value: number }>();
  private readonly viewport = { value: new THREE.Vector2() };
  private readonly direction = { value: new THREE.Vector3() };
  private readonly planes = { value: Array.from({ length: 4 }, () => new THREE.Vector4()) };
  private readonly centers = { value: Array.from({ length: 4 }, () => new THREE.Vector4()) };
  private readonly opacity = { value: [0, 0, 0, 0] };

  update(world: World): void {
    const grids: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
    world.scene.traverse((object) => {
      if (object.userData.coordinateGrid) grids.push(object as (typeof grids)[number]);
    });
    world.camera.updateMatrixWorld();
    world.renderer.getDrawingBufferSize(this.viewport.value);
    world.camera.getWorldDirection(this.direction.value);
    this.opacity.value.fill(0);
    grids.forEach((grid, index) => {
      if (!grid.visible) return;
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(grid.quaternion);
      this.planes.value[index].set(...normal.toArray(), -normal.dot(grid.position));
      this.centers.value[index].set(
        ...grid.position.toArray(),
        grid.material.uniforms.radius.value,
      );
      this.opacity.value[index] = grid.material.uniforms.fillOpacity.value;
    });
    const order = Math.max(...grids.filter((grid) => grid.visible).map((grid) => grid.renderOrder));
    world.scene.traverse((object) => {
      if (object.userData.coordinateGrid) return;
      const material = (object as THREE.Mesh).material;
      for (const entry of Array.isArray(material) ? material : material ? [material] : [])
        this.configure(entry, entry.transparent && object.renderOrder > order);
    });
  }

  private configure(material: THREE.Material, enabled: boolean): void {
    const previous = this.installed.get(material);
    if (previous) {
      previous.value = enabled ? 1 : 0;
      return;
    }
    if (!enabled) return;
    const active = { value: 1 };
    this.installed.set(material, active);
    const compile = material.onBeforeCompile.bind(material);
    const cache = material.customProgramCacheKey.bind(material);
    const key = cache();
    material.customProgramCacheKey = () => `${key}-grid-occlusion`;
    material.onBeforeCompile = (shader, renderer) => {
      compile(shader, renderer);
      Object.assign(shader.uniforms, {
        gridOcclusionEnabled: active,
        gridViewport: this.viewport,
        gridDirection: this.direction,
        gridPlanes: this.planes,
        gridCenters: this.centers,
        gridOpacity: this.opacity,
      });
      // Interpolate plane distances from geometry, rather than classifying the
      // quantized depth buffer. Coplanar fragments must all stay on the plane.
      const fatLine = shader.vertexShader.includes("attribute vec3 instanceStart;");
      const anchor = fatLine ? "gl_Position = clip;" : "#include <project_vertex>";
      const local = fatLine ? "(position.y < 0.5 ? instanceStart : instanceEnd)" : "transformed";
      shader.vertexShader = `uniform vec4 gridPlanes[4];
        uniform vec4 gridCenters[4]; varying float gridDistance[4];\n${shader.vertexShader}`.replace(
        anchor,
        `${anchor}
        vec3 gridPoint = (modelMatrix * vec4(${local}, 1.0)).xyz;
        for (int i = 0; i < 4; i++) {
          gridDistance[i] = dot(gridPlanes[i].xyz, gridPoint - gridCenters[i].xyz);
        }`,
      );
      shader.fragmentShader = `${fragment}\n${shader.fragmentShader}`.replace(
        "#include <premultiplied_alpha_fragment>",
        "gl_FragColor.a *= gridTransmission();\n#include <premultiplied_alpha_fragment>",
      );
    };
    material.needsUpdate = true;
  }
}

const fragment = `
varying float gridDistance[4];
uniform float gridOcclusionEnabled;
${gridFillGradientFragment}
uniform vec3 gridDirection;
uniform vec4 gridPlanes[4];
uniform vec4 gridCenters[4];
uniform float gridOpacity[4];
float gridTransmission() {
  if (gridOcclusionEnabled == 0.0) return 1.0;
  float transmission = 1.0;
  for (int i = 0; i < 4; i++) {
    float facing = dot(gridPlanes[i].xyz, gridDirection);
    if (gridOpacity[i] <= 0.0 || abs(facing) < 0.00001) continue;
    float distance = -gridDistance[i] / facing;
    if (distance >= -0.0001) continue;
    transmission *= 1.0 - gridOpacity[i] * gridFillGradient();
  }
  return transmission;
}`;

/** DOM coordinate labels follow the same ray/plane veil; widgets remain independent. */
export function gridLabelTransmission(world: World, point: THREE.Vector3): number {
  const direction = world.camera.getWorldDirection(new THREE.Vector3());
  let transmission = 1;
  world.scene.traverse((object) => {
    if (!object.visible || !object.userData.coordinateGrid) return;
    const grid = object as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(grid.quaternion);
    const facing = normal.dot(direction);
    if (Math.abs(facing) < 0.00001) return;
    const distance = normal.dot(grid.position.clone().sub(point)) / facing;
    if (distance >= -0.0001) return;
    const size = world.renderer.getSize(new THREE.Vector2());
    const projected = point.clone().project(world.camera);
    const fade = gridFillGradient(
      ((projected.x + 1) * size.x) / 2,
      ((projected.y + 1) * size.y) / 2,
      size.x,
      size.y,
    );
    transmission *= 1 - grid.material.uniforms.fillOpacity.value * fade;
  });
  return transmission;
}
