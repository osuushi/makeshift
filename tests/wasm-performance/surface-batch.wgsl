struct Patch { offset: u32, nu: u32, nv: u32, unused: u32 }
struct Basis { value: array<f32, 26>, derivative: array<f32, 26> }
struct Result { point: vec4<f32>, du: vec4<f32>, dv: vec4<f32> }
@group(0) @binding(0) var<storage, read> patches: array<Patch>;
@group(0) @binding(1) var<storage, read> poles: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> results: array<Result>;

fn basis(degree: u32, t: f32) -> Basis {
  var b: Basis;
  b.value[0] = 1.0;
  for (var k = 1u; k <= degree; k++) {
    if (k == degree) {
      for (var i = 0u; i <= degree; i++) {
        var previous = 0.0;
        if (i > 0u) { previous = b.value[i - 1u]; }
        b.derivative[i] = f32(degree) * (previous - b.value[i]);
      }
    }
    var saved = 0.0;
    for (var i = 0u; i < k; i++) {
      let old = b.value[i];
      b.value[i] = saved + (1.0 - t) * old;
      saved = t * old;
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
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= arrayLength(&results)) { return; }
  let span = patches[index % arrayLength(&patches)];
  let u = basis(span.nu - 1u, parameter(index, 73u));
  let v = basis(span.nv - 1u, parameter(index, 151u));
  var p = vec4<f32>(0.0);
  var du = vec4<f32>(0.0);
  var dv = vec4<f32>(0.0);
  for (var i = 0u; i < span.nu; i++) {
    for (var j = 0u; j < span.nv; j++) {
      let pole = poles[span.offset + i * span.nv + j];
      p += pole * (u.value[i] * v.value[j]);
      du += pole * (u.derivative[i] * v.value[j]);
      dv += pole * (u.value[i] * v.derivative[j]);
    }
  }
  let point = p.xyz / p.w;
  results[index] = Result(vec4<f32>(point, 1.0),
    vec4<f32>((du.xyz - point * du.w) / p.w, 0.0),
    vec4<f32>((dv.xyz - point * dv.w) / p.w, 0.0));
}
