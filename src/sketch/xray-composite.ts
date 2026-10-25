import * as THREE from "three";
import { viewDisplay } from "../preferences/view-display.js";
import type { Point } from "./planes.js";
import { coplanar } from "./planes.js";
import type { World } from "./world.js";
import { hasForegroundContent } from "./world-foreground.js";
import { XrayMask } from "./xray-mask.js";

/** A stable token identifies unchanged aperture inputs, independent of their geometry. */
export interface XrayAperture {
  read(world: World): object;
  render(world: World, target: THREE.WebGLRenderTarget, bleed: number): void;
  contains(world: World, point: Point, bleed: number): boolean;
  dispose(): void;
}

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
  private readonly mask: XrayAperture;
  private normal = new THREE.FramebufferTexture(1, 1);
  private readonly aperture = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private readonly horizontal = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private readonly soft = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private readonly size = new THREE.Vector2();
  private maskContents: object | null = null;
  private maskBleed = -1;
  private maskRadius = -1;
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
    transparent: true,
    uniforms: {
      normalImage: { value: this.normal },
      maskImage: { value: this.soft.texture },
      strength: { value: 1 },
      globalMask: { value: false },
    },
    fragmentShader: `uniform sampler2D normalImage; uniform sampler2D maskImage;
      uniform float strength; uniform bool globalMask; varying vec2 vUv;
      void main() {
        // Blend normal over the cut framebuffer: normal * (1-mask) + cut * mask.
        gl_FragColor = vec4(texture2D(normalImage, vUv).rgb, 1.0 - strength * (globalMask ? 1.0 : texture2D(maskImage, vUv).r));
        // Framebuffer captures already use the display transfer function.
      }`,
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mix);

  constructor(mask: XrayAperture = new XrayMask()) {
    this.mask = mask;
    this.scene.add(this.quad);
  }

  enabled(world: World): boolean {
    return !!world.partialSection && !world.crossSection && !viewDisplay().xrayGlobal;
  }

  contains(world: World, point: Point): boolean {
    return !this.enabled(world) || this.mask.contains(world, point, viewDisplay().xrayBleed);
  }

  render(world: World, normal: () => void, cut: () => void, bodyLayer = false): void {
    // In an active planar-only workspace both images are identical. Avoid the extra
    // scene presentation, framebuffer copy and mask work, especially on
    // Retina tablets. Keep enabled()/contains() independent: picking still uses
    // the same aperture when sectionable content is subsequently shown.
    if (!bodyLayer && planarOnlyWorkspace(world)) {
      cut();
      return;
    }
    const { renderer } = world;
    const target = renderer.getRenderTarget(),
      clipping = renderer.clippingPlanes,
      autoClear = renderer.autoClear;
    renderer.getDrawingBufferSize(this.size);
    this.resizeCaptures();
    try {
      renderer.autoClear = true;
      if (!bodyLayer) renderer.clippingPlanes = [];
      renderer.setRenderTarget(target);
      normal();
      // The capture API binds unit 0 only when its cached texture changes.
      // Explicitly activate it: the preceding composite leaves mask unit 1 active.
      renderer.state.activeTexture(renderer.getContext().TEXTURE0);
      renderer.copyFramebufferToTexture(this.normal);
      renderer.clippingPlanes = clipping;
      renderer.setRenderTarget(target);
      cut();
      renderer.clippingPlanes = [];
      const global = bodyLayer && viewDisplay().xrayGlobal;
      this.mix.uniforms.strength.value = bodyLayer ? 1 - viewDisplay().sectionFrontOpacity : 1;
      this.mix.uniforms.globalMask.value = global;
      if (!global) this.updateMask(world);
      renderer.setRenderTarget(target);
      // Match the old fullscreen presentation without clearing its cut color.
      renderer.clear(false, true, true);
      renderer.autoClear = false;
      this.quad.material = this.mix;
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.clippingPlanes = clipping;
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(target);
    }
  }

  invalidate(): void {
    this.maskContents = null;
  }

  private resizeCaptures(): void {
    if (this.normal.image.width === this.size.x && this.normal.image.height === this.size.y) return;
    this.normal.dispose();
    this.normal = new THREE.FramebufferTexture(this.size.x, this.size.y);
    this.mix.uniforms.normalImage.value = this.normal;
  }

  private updateMask(world: World): void {
    const contents = this.mask.read(world);
    const { xrayBleed: bleed, xrayRadius } = viewDisplay();
    const radius = xrayRadius * world.renderer.getPixelRatio();
    // Keep at least two texels across both dilation and blur. Sharp/narrow masks
    // retain full resolution; broad masks can shade 1/64 as many pixels.
    const margin = Math.min(bleed, xrayRadius);
    const scale = margin >= 16 ? 8 : margin >= 8 ? 4 : margin >= 4 ? 2 : 1;
    const width = Math.ceil(this.size.x / scale),
      height = Math.ceil(this.size.y / scale);
    const resized = this.aperture.width !== width || this.aperture.height !== height;
    if (
      !resized &&
      contents === this.maskContents &&
      bleed === this.maskBleed &&
      radius === this.maskRadius
    )
      return;
    for (const buffer of [this.aperture, this.horizontal, this.soft]) buffer.setSize(width, height);
    // Radius-only changes can reuse the sharp aperture too.
    if (resized || contents !== this.maskContents || bleed !== this.maskBleed)
      this.mask.render(world, this.aperture, bleed);
    if (radius > 0) this.soften(world.renderer, radius);
    this.mix.uniforms.maskImage.value = radius > 0 ? this.soft.texture : this.aperture.texture;
    this.maskContents = contents;
    this.maskBleed = bleed;
    this.maskRadius = radius;
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
    for (const target of [this.normal, this.aperture, this.horizontal, this.soft]) target.dispose();
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
