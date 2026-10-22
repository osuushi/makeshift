let device, pipeline;
async function initialize() {
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("No WebGPU adapter");
  const info = adapter.info;
  if (
    info.isFallbackAdapter ||
    info.type === "CPU" ||
    /swiftshader|llvmpipe/i.test(info.description)
  )
    throw new Error("Hardware GPU unavailable");
  device = await adapter.requestDevice();
  const code = await (await fetch("/benchmark/candidate-search.wgsl")).text();
  pipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module: device.createShaderModule({ code }), entryPoint: "search" },
  });
  return Object.fromEntries(
    ["vendor", "architecture", "device", "description", "backend", "type", "isFallbackAdapter"].map(
      (key) => [key, info[key]],
    ),
  );
}
async function search({ samples, points, shared }) {
  const status = new Int32Array(shared, 0, 1);
  const buffers = [];
  let scoped = false;
  try {
    if (
      points.length / 4 > device.limits.maxComputeWorkgroupsPerDimension ||
      samples.byteLength > device.limits.maxStorageBufferBindingSize
    )
      throw new Error("Batch exceeds GPU limits");
    device.pushErrorScope("validation");
    scoped = true;
    const input = (data) => {
      const buffer = device.createBuffer({
        size: data.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      buffers.push(buffer);
      device.queue.writeBuffer(buffer, 0, data);
      return buffer;
    };
    const grid = input(samples),
      queries = input(points);
    const size = points.length; // One four-byte index per float4 query.
    const output = device.createBuffer({
      size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const readback = device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    buffers.push(output, readback);
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [grid, queries, output].map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(points.length / 4);
    pass.end();
    encoder.copyBufferToBuffer(output, 0, readback, 0, size);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const error = await device.popErrorScope();
    scoped = false;
    if (error) throw new Error(error.message);
    new Int32Array(shared, 4).set(new Int32Array(readback.getMappedRange()));
    readback.unmap();
    Atomics.store(status, 0, 1);
  } catch {
    Atomics.store(status, 0, -1);
  } finally {
    if (scoped) await device.popErrorScope().catch(() => {});
    for (const buffer of buffers) buffer.destroy();
    Atomics.notify(status, 0);
  }
}
self.onmessage = async ({ data }) => {
  if (data.initialize) {
    try {
      self.postMessage({ ready: true, adapter: await initialize() });
    } catch (error) {
      self.postMessage({ ready: false, reason: String(error) });
    }
  } else await search(data);
};
