// Experimental two-f32 arithmetic; measured precision is not a formal error bound.
struct Pair { hi: vec4<f32>, lo: vec4<f32> }
struct Scalar { hi: f32, lo: f32 }
struct Patch { offset: u32, nu: u32, nv: u32, unused: u32 }
struct Basis { value: array<Scalar, 26>, derivative: array<Scalar, 26> }
struct Result { point: Pair, du: Pair, dv: Pair }
@group(0) @binding(0) var<storage, read> patches: array<Patch>;
@group(0) @binding(1) var<storage, read> poles: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> results: array<Result>;

fn number(x: f32) -> Scalar { return Scalar(x, 0.0); }
fn add(a: Scalar, b: Scalar) -> Scalar {
  let s = a.hi + b.hi;
  let v = s - a.hi;
  let e = (a.hi - (s - v)) + (b.hi - v) + a.lo + b.lo;
  let hi = s + e;
  return Scalar(hi, e - (hi - s));
}
fn neg(a: Scalar) -> Scalar { return Scalar(-a.hi, -a.lo); }
fn mul(a: Scalar, b: Scalar) -> Scalar {
  let p = a.hi * b.hi;
  let e = fma(a.hi, b.hi, -p) + a.hi * b.lo + a.lo * b.hi;
  let hi = p + e;
  return Scalar(hi, e - (hi - p));
}
fn divide(a: Scalar, b: Scalar) -> Scalar {
  let first = number(a.hi / b.hi);
  let residual = add(a, neg(mul(first, b)));
  return add(first, number((residual.hi + residual.lo) / b.hi));
}
fn basis(degree: u32, t: f32) -> Basis {
  var b: Basis;
  b.value[0] = number(1.0);
  for (var k = 1u; k <= degree; k++) {
    if (k == degree) {
      for (var i = 0u; i <= degree; i++) {
        var previous = number(0.0);
        if (i > 0u) { previous = b.value[i - 1u]; }
        b.derivative[i] = mul(number(f32(degree)), add(previous, neg(b.value[i])));
      }
    }
    var saved = number(0.0);
    for (var i = 0u; i < k; i++) {
      let old = b.value[i];
      b.value[i] = add(saved, mul(number(1.0 - t), old));
      saved = mul(number(t), old);
    }
    b.value[k] = saved;
  }
  return b;
}
fn parameter(i: u32, multiplier: u32) -> f32 {
  if (i % 17u == 0u) { return 0.0; }
  if (i % 19u == 0u) { return 1.0; }
  return f32((i * multiplier) % 65536u) / 65536.0;
}
fn component(p: Pair, axis: u32) -> Scalar { return Scalar(p.hi[axis], p.lo[axis]); }
fn scaled(p: Pair, scale: Scalar) -> Pair {
  var result: Pair;
  for (var axis = 0u; axis < 4u; axis++) {
    let value = mul(component(p, axis), scale);
    result.hi[axis] = value.hi;
    result.lo[axis] = value.lo;
  }
  return result;
}
fn accumulate(a: Pair, b: Pair) -> Pair {
  var result: Pair;
  for (var axis = 0u; axis < 4u; axis++) {
    let value = add(component(a, axis), component(b, axis));
    result.hi[axis] = value.hi;
    result.lo[axis] = value.lo;
  }
  return result;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= arrayLength(&results)) { return; }
  let span = patches[index % arrayLength(&patches)];
  let u = basis(span.nu - 1u, parameter(index, 73u));
  let v = basis(span.nv - 1u, parameter(index, 151u));
  var p: Pair;
  var du: Pair;
  var dv: Pair;
  for (var i = 0u; i < span.nu; i++) {
    for (var j = 0u; j < span.nv; j++) {
      let offset = span.offset + (i * span.nv + j) * 2u;
      let pole = Pair(poles[offset], poles[offset + 1u]);
      p = accumulate(p, scaled(pole, mul(u.value[i], v.value[j])));
      du = accumulate(du, scaled(pole, mul(u.derivative[i], v.value[j])));
      dv = accumulate(dv, scaled(pole, mul(u.value[i], v.derivative[j])));
    }
  }
  var result: Result;
  let weight = component(p, 3u);
  for (var axis = 0u; axis < 3u; axis++) {
    let point = divide(component(p, axis), weight);
    let derivativeU = divide(add(component(du, axis), neg(mul(point, component(du, 3u)))), weight);
    let derivativeV = divide(add(component(dv, axis), neg(mul(point, component(dv, 3u)))), weight);
    result.point.hi[axis] = point.hi;
    result.point.lo[axis] = point.lo;
    result.du.hi[axis] = derivativeU.hi;
    result.du.lo[axis] = derivativeU.lo;
    result.dv.hi[axis] = derivativeV.hi;
    result.dv.lo[axis] = derivativeV.lo;
  }
  results[index] = result;
}
