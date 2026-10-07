import * as THREE from "three";
import type { PlaneId } from "./planes.js";

export function gridMaterial(id: PlaneId | "work"): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: id !== "work",
    side: THREE.DoubleSide,
    uniforms: {
      extent: { value: 1 },
      spacing: { value: 1 },
      lineWidth: { value: 1 },
      strength: { value: 0.2 },
      opacityScale: { value: 1 },
      radius: { value: 160 },
      center: { value: new THREE.Vector2() },
      gridColor: { value: new THREE.Color("#758296") },
    },
    vertexShader: `varying vec2 coordinate; uniform float extent; uniform vec2 center;
        void main() { coordinate = position.xy * extent + center;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 coordinate;
        uniform float spacing; uniform float lineWidth; uniform float strength; uniform float radius;
        uniform float opacityScale;
        uniform vec2 center; uniform vec3 gridColor;
        float grid(float stepSize) {
          vec2 p = coordinate / stepSize;
          vec2 width = max(fwidth(p) * lineWidth, vec2(0.00001));
          vec2 d = abs(fract(p - 0.5) - 0.5) / width;
          return 1.0 - min(min(d.x, d.y), 1.0);
        }
        void main() {
          float fade = exp(-dot(coordinate-center,coordinate-center)/(radius*radius));
          float lines = max(grid(spacing)*0.6,grid(spacing*10.0));
          vec3 color = gridColor;
          float alpha = lines*strength*fade;
          gl_FragColor = vec4(color,min(1.0,alpha*opacityScale));
        }`,
  });
}
