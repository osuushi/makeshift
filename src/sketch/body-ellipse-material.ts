import * as THREE from "three";

/** A single instanced draw unions soft apertures without darkening their overlaps. */
export function bodyEllipseMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    uniforms: {
      viewport: { value: new THREE.Vector2() },
      bleed: { value: 0 },
      feather: { value: 0 },
      pixelWidth: { value: 1 },
    },
    vertexShader: `
      attribute vec2 center; attribute vec2 radii; attribute vec2 direction;
      uniform vec2 viewport; uniform float bleed; uniform float feather;
      uniform float pixelWidth;
      varying vec2 localPoint; varying vec2 axes;
      void main() {
        axes = max(radii, vec2(0.001));
        localPoint = position.xy * (axes + bleed + feather + pixelWidth);
        vec2 screen = center + vec2(
          direction.x * localPoint.x - direction.y * localPoint.y,
          direction.y * localPoint.x + direction.x * localPoint.y);
        gl_Position = vec4(screen / viewport * 2.0 - 1.0, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform float bleed; uniform float feather; uniform float pixelWidth;
      varying vec2 localPoint; varying vec2 axes;
      float ellipseDistance(vec2 point, vec2 radius) {
        vec2 p = abs(point);
        float normalized = length(p / radius);
        if (normalized <= 1.0) {
          // First-order signed distance inside, exact near the edge.
          return normalized < 0.000001 ? -min(radius.x, radius.y) :
            (normalized - 1.0) * normalized / length(p / (radius * radius));
        }
        // The closest exterior point is r^2*p/(t+r^2). Its ellipse equation
        // decreases monotonically with t; a bounded solve is stable at axis tips.
        vec2 squared = radius * radius;
        float low = 0.0;
        float high = max(radius.x, radius.y) * length(p);
        for (int i = 0; i < 14; i++) {
          float t = (low + high) * 0.5;
          vec2 q = radius * p / (squared + t);
          if (dot(q, q) > 1.0) low = t; else high = t;
        }
        return length(p - squared * p / (squared + (low + high) * 0.5));
      }
      void main() {
        float distance = ellipseDistance(localPoint, axes) - bleed;
        float width = max(feather, pixelWidth * 0.5);
        float mask = 1.0 - smoothstep(-width, width, distance);
        gl_FragColor = vec4(vec3(mask), 1.0);
      }`,
  });
}
