import * as THREE from "three";
import { viewDisplay } from "../preferences/view-display.js";
import { type PlaneFrame, planeIds, planes } from "./planes.js";

export function createGrids(scene: THREE.Scene) {
  const grids = [...planeIds, "work" as const].map((id) => {
    const frame = id === "work" ? planes.XY : planes[id];
    const u = new THREE.Vector3(...frame.u);
    const v = new THREE.Vector3(...frame.v);
    const normal = u.clone().cross(v);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: id !== "work",
      side: THREE.DoubleSide,
      uniforms: {
        spacing: { value: 1 },
        strength: { value: 0.2 },
        opacityScale: { value: 1 },
        radius: { value: 160 },
        center: { value: new THREE.Vector2() },
        uColor: { value: new THREE.Color(id === "YZ" ? "#43916b" : "#ca6470") },
        vColor: { value: new THREE.Color(id === "XY" ? "#43916b" : "#5983c8") },
      },
      vertexShader: `varying vec2 coordinate;
        void main() { coordinate = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 coordinate;
        uniform float spacing; uniform float strength; uniform float radius;
        uniform float opacityScale;
        uniform vec2 center; uniform vec3 uColor; uniform vec3 vColor;
        float grid(float stepSize) {
          vec2 p = coordinate / stepSize;
          vec2 width = max(fwidth(p), vec2(0.00001));
          vec2 d = abs(fract(p - 0.5) - 0.5) / width;
          return 1.0 - min(min(d.x, d.y), 1.0);
        }
        void main() {
          float fade = exp(-dot(coordinate-center,coordinate-center)/(radius*radius));
          float lines = max(grid(spacing)*0.6,grid(spacing*10.0));
          vec2 axes = 1.0 - min(abs(coordinate)/max(fwidth(coordinate),vec2(0.00001)),1.0);
          vec3 color = vec3(0.46,0.51,0.59);
          if(axes.y > 0.0) color = uColor;
          if(axes.x > 0.0) color = vColor;
          float alpha = max(lines*strength,max(axes.x,axes.y)*0.65)*fade;
          gl_FragColor = vec4(color,min(1.0,alpha*opacityScale));
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(100000, 100000), material);
    mesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(u, v, normal));
    // The active sketch plane stays legible over bodies, fills and highlights.
    mesh.renderOrder = id === "work" ? 100 : -10;
    scene.add(mesh);
    return { id, mesh, normal, u, v, material };
  });
  return {
    update(
      camera: THREE.Camera,
      target: THREE.Vector3,
      height: number,
      active: PlaneFrame | null,
      viewportHeight: number,
    ) {
      const direction = camera.getWorldDirection(new THREE.Vector3());
      // Keep squares near 32 CSS pixels with familiar decimal snap increments.
      // Geometric midpoints select the closest step by proportional screen size.
      const desired = (32 * height) / Math.max(1, viewportHeight);
      const decade = 10 ** Math.floor(Math.log10(desired));
      const fraction = desired / decade;
      const step =
        fraction < Math.sqrt(2)
          ? 1
          : fraction < Math.sqrt(10)
            ? 2
            : fraction < Math.sqrt(50)
              ? 5
              : 10;
      const spacing = step * decade;
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
        const facing = Math.abs(direction.dot(grid.normal));
        grid.material.uniforms.spacing.value = spacing;
        grid.material.uniforms.opacityScale.value = viewDisplay().grid / 0.4;
        grid.material.uniforms.strength.value =
          (grid.id === "work" ? 0.4 : 0.22) * Math.min(1, facing * 5);
        grid.material.uniforms.radius.value = height * 1.15;
        grid.material.uniforms.center.value.set(
          target.clone().sub(grid.mesh.position).dot(grid.u),
          target.clone().sub(grid.mesh.position).dot(grid.v),
        );
        grid.mesh.visible = facing > 0.005;
      }
      return spacing;
    },
    dispose() {
      for (const { mesh, material } of grids) {
        mesh.geometry.dispose();
        material.dispose();
        scene.remove(mesh);
      }
    },
  };
}
