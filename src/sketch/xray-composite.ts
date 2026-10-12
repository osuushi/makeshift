import * as THREE from "three";
import { viewDisplay } from "../preferences/view-display.js";
import type { Point } from "./planes.js";
import { coplanar } from "./planes.js";
import type { World } from "./world.js";
import { hasForegroundContent } from "./world-foreground.js";
import { XrayMask } from "./xray-mask.js";

const vertexShader = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const blurFragment = `uniform sampler2D source; uniform vec2 stepSize; varying vec2 vUv;
void main() {
  float sum = 0.0; float weight = 0.0;
  for (int i = -12; i <= 12; i++) {
    float t = float(i) / 12.0;
    float w = exp(-4.5 * t * t);
    sum += texture2D(source, vUv + stepSize * t).r * w;
    weight += w;
  }
  gl_FragColor = vec4(vec3(sum / weight), 1.0);
}`;

/** Mix complete normal/cut presentations, so both caps and front translucency
 * disappear outside the same softened content mask. */
export class XrayComposite {
  private readonly mask = new XrayMask();
  private normal = new THREE.FramebufferTexture(1, 1);
  private cut = new THREE.FramebufferTexture(1, 1);
  private readonly aperture = new THREE.WebGLRenderTarget(1, 1);
  private readonly horizontal = new THREE.WebGLRenderTarget(1, 1);
  private readonly soft = new THREE.WebGLRenderTarget(1, 1);
  private readonly size = new THREE.Vector2();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blur = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: blurFragment,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      source: { value: this.aperture.texture },
      stepSize: { value: new THREE.Vector2() },
    },
  });
  private readonly mix = new THREE.ShaderMaterial({
    vertexShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      normalImage: { value: this.normal },
      cutImage: { value: this.cut },
      maskImage: { value: this.soft.texture },
    },
    fragmentShader: `uniform sampler2D normalImage; uniform sampler2D cutImage; uniform sampler2D maskImage; varying vec2 vUv;
      void main() {
        gl_FragColor = mix(texture2D(normalImage, vUv), texture2D(cutImage, vUv), texture2D(maskImage, vUv).r);
        // Framebuffer captures already use the display transfer function.
      }`,
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mix);

  constructor() {
    this.scene.add(this.quad);
  }

  enabled(world: World): boolean {
    return !!world.partialSection && !world.crossSection && !viewDisplay().xrayGlobal;
  }

  contains(world: World, point: Point): boolean {
    return !this.enabled(world) || this.mask.contains(world, point, viewDisplay().xrayBleed);
  }

  render(world: World, normal: () => void, cut: () => void): void {
    // In an active planar-only workspace both images are identical. Avoid two
    // full-size framebuffer copies and 50 blur samples per pixel, especially on
    // Retina tablets. Keep enabled()/contains() independent: picking still uses
    // the same aperture when sectionable content is subsequently shown.
    if (planarOnlyWorkspace(world)) {
      cut();
      return;
    }
    const { renderer } = world;
    const target = renderer.getRenderTarget(),
      clipping = renderer.clippingPlanes,
      autoClear = renderer.autoClear;
    renderer.getDrawingBufferSize(this.size);
    this.resizeCaptures();
    for (const buffer of [this.aperture, this.horizontal, this.soft])
      if (buffer.width !== this.size.x || buffer.height !== this.size.y)
        buffer.setSize(this.size.x, this.size.y);
    try {
      renderer.autoClear = true;
      renderer.clippingPlanes = [];
      renderer.setRenderTarget(target);
      normal();
      // The capture API binds unit 0 only when its cached texture changes.
      // Explicitly activate it: the preceding composite leaves mask unit 2 active.
      renderer.state.activeTexture(renderer.getContext().TEXTURE0);
      renderer.copyFramebufferToTexture(this.normal);
      renderer.clippingPlanes = clipping;
      renderer.setRenderTarget(target);
      cut();
      renderer.state.activeTexture(renderer.getContext().TEXTURE0);
      renderer.copyFramebufferToTexture(this.cut);
      renderer.clippingPlanes = [];
      this.mask.render(world, this.aperture, viewDisplay().xrayBleed);
      this.soften(renderer, viewDisplay().xrayRadius * renderer.getPixelRatio());
      renderer.setRenderTarget(target);
      this.quad.material = this.mix;
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.clippingPlanes = clipping;
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(target);
    }
  }

  private resizeCaptures(): void {
    if (this.normal.image.width === this.size.x && this.normal.image.height === this.size.y) return;
    this.normal.dispose();
    this.cut.dispose();
    this.normal = new THREE.FramebufferTexture(this.size.x, this.size.y);
    this.cut = new THREE.FramebufferTexture(this.size.x, this.size.y);
    this.mix.uniforms.normalImage.value = this.normal;
    this.mix.uniforms.cutImage.value = this.cut;
  }

  private soften(renderer: THREE.WebGLRenderer, radius: number): void {
    this.quad.material = this.blur;
    this.blur.uniforms.source.value = this.aperture.texture;
    this.blur.uniforms.stepSize.value.set(radius / this.size.x, 0);
    renderer.setRenderTarget(this.horizontal);
    renderer.render(this.scene, this.camera);
    this.blur.uniforms.source.value = this.horizontal.texture;
    this.blur.uniforms.stepSize.value.set(0, radius / this.size.y);
    renderer.setRenderTarget(this.soft);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.mask.dispose();
    for (const target of [this.normal, this.cut, this.aperture, this.horizontal, this.soft])
      target.dispose();
    this.quad.geometry.dispose();
    this.blur.dispose();
    this.mix.dispose();
  }
}

export function planarOnlyWorkspace(
  world: Pick<World, "activeFrame" | "scene" | "renderForegroundOverlays" | "xraySource">,
): boolean {
  const frame = world.activeFrame;
  if (!frame || hasForegroundContent(world.scene, world.renderForegroundOverlays)) return false;
  const source = world.xraySource();
  return source.sketches.every(
    (sketch) => !source.visible(sketch.id) || coplanar(frame, sketch.plane),
  );
}
