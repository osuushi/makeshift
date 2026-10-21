@group(0) @binding(0) var<storage, read> samples: array<vec4f>;
@group(0) @binding(1) var<storage, read> points: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> results: array<u32>;
var<workgroup> distances: array<f32, 256>;
var<workgroup> indices: array<u32, 256>;
@compute @workgroup_size(256)
fn search(@builtin(workgroup_id) group: vec3u, @builtin(local_invocation_index) lane: u32) {
    let point = points[group.x].xyz;
    var best = 3.402823e38;
    var index = 0xffffffffu;
    for (var i = lane; i < arrayLength(&samples); i += 256u) {
        let delta = samples[i].xyz - point;
        let distance = dot(delta, delta);
        if (distance < best || (distance == best && i < index)) {
            best = distance;
            index = i;
        }
    }
    distances[lane] = best;
    indices[lane] = index;
    workgroupBarrier();
    for (var stride = 128u; stride > 0u; stride /= 2u) {
        if (lane < stride) {
            let other = lane + stride;
            if (distances[other] < distances[lane] ||
                (distances[other] == distances[lane] && indices[other] < indices[lane])) {
                distances[lane] = distances[other];
                indices[lane] = indices[other];
            }
        }
        workgroupBarrier();
    }
    if (lane == 0u) { results[group.x] = indices[0]; }
}
