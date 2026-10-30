/** Analytic radial-graph normal, in the saved thread frame. Kept separate for GPU parity tests. */
export const threadNormalGLSL = `
uniform vec4 threadDimensions; // radius, pitch, depth, hole clearance
uniform vec4 threadShape; // triangle/metric/rounded, rod/hole cut sign, hand, outward
uniform vec4 threadEnds; // low, high, start length, end length
uniform float threadTip;
const float threadTau = 6.283185307179586;
vec2 threadProfile(float phase) {
  if (threadShape.x > 1.5) return vec2(0.5 - 0.5 * cos(threadTau * phase), 0.5 * threadTau * sin(threadTau * phase));
  float triangle = 1.0 - abs(2.0 * phase - 1.0);
  float slope = phase < 0.5 ? 2.0 : -2.0;
  if (threadShape.x > 0.5) return vec2(clamp((triangle - 0.125) / 0.625, 0.0, 1.0),
    triangle > 0.125 && triangle < 0.75 ? slope / 0.625 : 0.0);
  if (threadShape.y < 0.0) {
    if (threadShape.w > 0.0) return vec2(max(threadTip, triangle), triangle > threadTip ? slope : 0.0);
    return vec2(max(0.0, (triangle - threadTip) / (1.0 - threadTip)), triangle > threadTip ? slope / (1.0 - threadTip) : 0.0);
  }
  if (threadShape.w > 0.0) return vec2(min(1.0 - threadTip, triangle), triangle < 1.0 - threadTip ? slope : 0.0);
  return vec2(min(1.0, triangle / (1.0 - threadTip)), triangle < 1.0 - threadTip ? slope / (1.0 - threadTip) : 0.0);
}
vec3 threadNormal(vec3 point) {
  float angle = atan(point.y, point.x);
  vec3 radial = vec3(cos(angle), sin(angle), 0.0);
  float outward = threadShape.w;
  if (point.z < threadEnds.x || point.z > threadEnds.y) return outward * radial;
  float phase = fract(point.z / threadDimensions.y - threadShape.z * angle / threadTau);
  vec2 profile = threadProfile(phase);
  float radius = threadDimensions.x + threadShape.y * threadDimensions.z * profile.x + threadDimensions.w;
  float phaseSlope = threadShape.y * threadDimensions.z * profile.y;
  float angularSlope = -threadShape.z * phaseSlope / threadTau;
  float axialSlope = phaseSlope / threadDimensions.y;
  float fraction = 1.0;
  float fractionSlope = 0.0;
  if (threadEnds.z > 0.0 && (point.z - threadEnds.x) / threadEnds.z < fraction) {
    fraction = (point.z - threadEnds.x) / threadEnds.z;
    fractionSlope = 1.0 / threadEnds.z;
  }
  if (threadEnds.w > 0.0 && (threadEnds.y - point.z) / threadEnds.w < fraction) {
    fraction = (threadEnds.y - point.z) / threadEnds.w;
    fractionSlope = -1.0 / threadEnds.w;
  }
  float minimum = threadDimensions.x + (threadShape.y < 0.0 ? -threadDimensions.z : 0.0);
  float cone = minimum + threadDimensions.z * (outward > 0.0 ? fraction : 1.0 - fraction) + threadDimensions.w;
  if (outward * (radius - cone) > 0.0) {
    radius = cone;
    angularSlope = 0.0;
    axialSlope = outward * threadDimensions.z * fractionSlope;
  }
  vec3 tangent = vec3(-radial.y, radial.x, 0.0);
  return outward * normalize(radial - angularSlope / radius * tangent - vec3(0.0, 0.0, axialSlope));
}
vec3 filteredThreadNormal(vec3 point) {
  vec3 dx = dFdx(point), dy = dFdy(point);
  vec3 result = threadNormal(point - 0.25 * dx - 0.25 * dy)
    + threadNormal(point + 0.25 * dx - 0.25 * dy)
    + threadNormal(point - 0.25 * dx + 0.25 * dy)
    + threadNormal(point + 0.25 * dx + 0.25 * dy);
  float r2 = max(dot(point.xy, point.xy), 0.000001);
  float phaseDx = dx.z / threadDimensions.y - threadShape.z * (point.x * dx.y - point.y * dx.x) / (threadTau * r2);
  float phaseDy = dy.z / threadDimensions.y - threadShape.z * (point.x * dy.y - point.y * dy.x) / (threadTau * r2);
  vec3 radial = threadShape.w * normalize(vec3(point.xy, 0.0));
  return normalize(mix(normalize(result), radial, smoothstep(0.25, 1.0, abs(phaseDx) + abs(phaseDy))));
}
`;
