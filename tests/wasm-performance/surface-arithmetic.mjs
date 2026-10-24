// Check the rounding assumptions behind the compensated shader on this backend.
export async function arithmeticCheck(device, shader) {
  const math = shader.slice(shader.indexOf("fn number"), shader.indexOf("fn basis"));
  const module = device.createShaderModule({
    code: `
struct Scalar { hi: f32, lo: f32 }
@group(0) @binding(0) var<storage, read> inputs: array<f32>;
@group(0) @binding(1) var<storage, read_write> outputs: array<f32>;
${math}
@compute @workgroup_size(1) fn main() {
  let sum = add(number(inputs[0]), number(inputs[1]));
  let product = mul(number(inputs[2]), number(inputs[3]));
  outputs[0] = sum.hi; outputs[1] = sum.lo;
  outputs[2] = product.hi; outputs[3] = product.lo;
}`,
  });
  const pipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });
  const input = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const output = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readback = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  try {
    const values = [16777216, 1, 1 + 2 ** -23, 1 + 2 ** -23];
    device.queue.writeBuffer(input, 0, new Float32Array(values));
    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [input, output].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(1);
    pass.end();
    encoder.copyBufferToBuffer(output, 0, readback, 0, 16);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const actual = Array.from(new Float32Array(readback.getMappedRange()));
    return {
      inputs: values,
      actual,
      expectedSum: values[0] + values[1],
      actualSum: actual[0] + actual[1],
      expectedProduct: values[2] * values[3],
      actualProduct: actual[2] + actual[3],
    };
  } finally {
    input.destroy();
    output.destroy();
    readback.destroy();
  }
}
