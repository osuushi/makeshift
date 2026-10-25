import * as THREE from "three";

const vertexShader = `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const decode = `
uniform sampler2D source;
uniform vec2 size;
uniform vec2 pixelSize;
vec2 seedAt(vec2 uv) {
  vec4 bytes = floor(texture2D(source, uv) * 255.0 + 0.5);
  return vec2(bytes.r * 256.0 + bytes.g, bytes.b * 256.0 + bytes.a) - 1.0;
}
vec4 encode(vec2 point) {
  vec2 p = point + 1.0;
  return vec4(floor(p.x / 256.0), mod(p.x, 256.0), floor(p.y / 256.0), mod(p.y, 256.0)) / 255.0;
}
float distanceSquared(vec2 seed, vec2 point) {
  vec2 d = (seed - point) * pixelSize;
  return dot(d, d);
}`;

/** Raster-distance dilation, independent of mesh density. Packed RGBA8 seeds avoid
 * float-render-target extensions on WebKit. Jump flooding plus a final unit step
 * preserves round bleed and holes to mask-texel precision, before the shared blur. */
export class ScreenDilation {
  readonly seed = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `void main() {
      vec2 p = floor(gl_FragCoord.xy) + 1.0;
      gl_FragColor = vec4(floor(p.x / 256.0), mod(p.x, 256.0), floor(p.y / 256.0), mod(p.y, 256.0)) / 255.0;
    }`,
  });
  private readonly buffers = [0, 1].map(
    () =>
      new THREE.WebGLRenderTarget(1, 1, {
        depthBuffer: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      }),
  );
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly uniforms = {
    source: { value: this.buffers[0].texture },
    size: { value: new THREE.Vector2() },
    pixelSize: { value: new THREE.Vector2() },
    jump: { value: 1 },
    radius: { value: 1 },
  };
  private readonly spread = new THREE.ShaderMaterial({
    vertexShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: this.uniforms,
    fragmentShader: `${decode}
      uniform float jump;
      void main() {
        vec2 point = floor(gl_FragCoord.xy);
        vec2 best = vec2(-1.0);
        float distance = 1.0e20;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 uv = (gl_FragCoord.xy + vec2(float(x), float(y)) * jump) / size;
          vec2 candidate = seedAt(uv);
          float d = distanceSquared(candidate, point);
          if (candidate.x >= 0.0 && d < distance) { best = candidate; distance = d; }
        }
        gl_FragColor = best.x >= 0.0 ? encode(best) : vec4(0.0);
      }`,
  });
  private readonly resolve = new THREE.ShaderMaterial({
    vertexShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: this.uniforms,
    fragmentShader: `${decode}
      uniform float radius;
      void main() {
        vec2 seed = seedAt(gl_FragCoord.xy / size);
        float inside = seed.x >= 0.0 && distanceSquared(seed, floor(gl_FragCoord.xy)) <= radius * radius ? 1.0 : 0.0;
        gl_FragColor = vec4(vec3(inside), 1.0);
      }`,
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.spread);

  constructor() {
    this.scene.add(this.quad);
  }

  render(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    width: number,
    height: number,
    radius: number,
    silhouette: () => void,
  ): void {
    for (const buffer of this.buffers) buffer.setSize(target.width, target.height);
    this.uniforms.size.value.set(target.width, target.height);
    this.uniforms.pixelSize.value.set(width / target.width, height / target.height);
    this.uniforms.radius.value = Math.max(1, radius);
    renderer.setRenderTarget(this.buffers[0]);
    silhouette();
    let index = 0;
    const step = (jump: number) => {
      this.uniforms.source.value = this.buffers[index].texture;
      this.uniforms.jump.value = jump;
      index = 1 - index;
      renderer.setRenderTarget(this.buffers[index]);
      renderer.render(this.scene, this.camera);
    };
    this.quad.material = this.spread;
    const pixels = Math.max(1, radius / Math.min(width / target.width, height / target.height));
    for (let jump = 2 ** Math.floor(Math.log2(pixels)); jump >= 1; jump /= 2) step(jump);
    step(1);
    this.uniforms.source.value = this.buffers[index].texture;
    this.quad.material = this.resolve;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const buffer of this.buffers) buffer.dispose();
    this.seed.dispose();
    this.spread.dispose();
    this.resolve.dispose();
    this.quad.geometry.dispose();
  }
}
