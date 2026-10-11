import * as THREE from "three";

const palettes = [
  ["#d9eadb", "#527963"],
  ["#e6ddf0", "#796294"],
  ["#f4e1cb", "#a6794e"],
  ["#d5e9ef", "#477a8b"],
  ["#f1d9df", "#98596b"],
  ["#eee9c8", "#8b8042"],
];

/** Keep assigned colors stable, using every palette before repeating a color. */
export class SectionPalettes {
  private readonly assigned = new Map<string, number>();

  forBodies(bodies: string[]): ReadonlyMap<string, number> {
    const current = new Set(bodies);
    // Retain hidden bodies so toggling visibility cannot change their colors.
    const counts = palettes.map(() => 0);
    for (const [id, palette] of this.assigned) if (current.has(id)) counts[palette]++;
    for (const id of bodies) {
      if (this.assigned.has(id)) continue;
      const preferred = palettes.indexOf(sectionStyle(id).colors);
      const least = Math.min(...counts);
      const palette =
        Array.from({ length: palettes.length }, (_, i) => (preferred + i) % palettes.length).find(
          (i) => counts[i] === least,
        ) ?? preferred;
      this.assigned.set(id, palette);
      counts[palette]++;
    }
    return this.assigned;
  }
}

/** Fresh candidate IDs must not reshuffle material patterns during one edit. */
export class SectionStyleSeeds {
  private kind: string | null = null;
  private seeds: string[] = [];
  forBody(kind: string | null, index: number, id: string, accepted: boolean): string {
    if (kind !== this.kind) {
      this.kind = kind;
      this.seeds = [];
    }
    if (!kind || accepted) return id;
    this.seeds[index] ??= id;
    return this.seeds[index];
  }
}

/** Stable pseudo-random presentation from document-local identity, never triangle indexes. */
export function sectionStyle(body: string, palette?: number) {
  let seed = 2166136261;
  for (const character of body) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  seed >>>= 0;
  return {
    colors: palettes[palette ?? seed % palettes.length],
    pattern: (seed >>> 8) % 4,
    angle: ((seed >>> 16) % 180) * (Math.PI / 180),
  };
}

/** Plane-local, antialiased hatch, crosshatch, dot and staggered brick patterns. */
export function sectionMaterial(body: string, palette?: number): THREE.MeshBasicMaterial {
  const style = sectionStyle(body, palette);
  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    stencilWrite: true,
    stencilRef: 8,
    stencilFuncMask: 60,
    stencilWriteMask: 32,
    stencilFunc: THREE.EqualStencilFunc,
    stencilZPass: THREE.InvertStencilOp,
  });
  // A flat double-sided cap must blend once, rather than once for each side.
  material.forceSinglePass = true;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      sectionA: { value: new THREE.Color(style.colors[0]) },
      sectionB: { value: new THREE.Color(style.colors[1]) },
      sectionPattern: { value: style.pattern },
      sectionAngle: { value: style.angle },
    });
    shader.vertexShader = `varying vec2 sectionPoint;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nsectionPoint = position.xy;",
    );
    shader.fragmentShader = `${patternShader}\n${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.rgb *= mix(sectionA, sectionB, sectionInk());",
    );
  };
  material.customProgramCacheKey = () => "section-procedural-pattern";
  return material;
}

const patternShader = `
varying vec2 sectionPoint;
uniform vec3 sectionA;
uniform vec3 sectionB;
uniform int sectionPattern;
uniform float sectionAngle;
float sectionLine(float coordinate) {
  float distance = abs(fract(coordinate + 0.5) - 0.5);
  float aa = max(fwidth(coordinate), 0.001);
  return 1.0 - smoothstep(0.055 - aa, 0.055 + aa, distance);
}
float sectionInk() {
  float c = cos(sectionAngle), s = sin(sectionAngle);
  vec2 p = mat2(c, -s, s, c) * sectionPoint / 1.5;
  if (sectionPattern == 0) return sectionLine(p.x);
  if (sectionPattern == 1) return max(sectionLine(p.x), sectionLine(p.y));
  if (sectionPattern == 2) {
    float d = length(fract(p) - 0.5);
    float aa = max(length(fwidth(p)), 0.001);
    return 1.0 - smoothstep(0.13 - aa, 0.13 + aa, d);
  }
  return max(sectionLine(p.y), sectionLine(p.x + mod(floor(p.y), 2.0) * 0.5));
}`;
