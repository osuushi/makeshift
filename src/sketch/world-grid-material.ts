import * as THREE from "three";
import { coordinateDepthFragment } from "./coordinate-plane-depth.js";
import type { PlaneId } from "./planes.js";

export function gridMaterial(id: PlaneId | "work"): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: id !== "work",
    side: THREE.DoubleSide,
    uniforms: {
      coordinateDepthDistance: { value: 200 },
      coordinateViewCenter: { value: new THREE.Vector3() },
      coordinateViewDirection: { value: new THREE.Vector3() },
      coordinateDepthEnabled: { value: id === "work" ? 0 : 1 },
      extent: { value: 1 },
      spacing: { value: 1 },
      lineWidth: { value: 1 },
      strength: { value: 0.2 },
      opacityScale: { value: 1 },
      fillOpacity: { value: 0.1 },
      radius: { value: 160 },
      center: { value: new THREE.Vector2() },
      gridColor: { value: new THREE.Color("#758296") },
    },
    vertexShader: `uniform vec3 coordinateViewCenter; uniform vec3 coordinateViewDirection;
        varying float coordinateDepth; varying vec2 coordinate; uniform float extent; uniform vec2 center;
        void main() { coordinate = position.xy * extent + center;
          coordinateDepth = dot((modelMatrix * vec4(position, 1.0)).xyz -
            coordinateViewCenter, coordinateViewDirection);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `${coordinateDepthFragment}
        varying float coordinateDepth; uniform float coordinateDepthEnabled;
        varying vec2 coordinate;
        uniform float spacing; uniform float lineWidth; uniform float strength; uniform float radius;
        uniform float opacityScale; uniform float fillOpacity;
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
          float depthFade = mix(1.0, coordinateDepthFade(coordinateDepth), coordinateDepthEnabled);
          float lineAlpha = min(1.0, lines * strength * opacityScale);
          float fillAlpha = fillOpacity * (1.0 - lineAlpha);
          float alpha = lineAlpha + fillAlpha;
          vec3 color = (gridColor * lineAlpha + vec3(1.0) * fillAlpha) / max(alpha, 0.00001);
          gl_FragColor = vec4(color, alpha * fade * depthFade);
        }`,
  });
}
