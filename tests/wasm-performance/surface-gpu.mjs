// Runs inside the benchmark page. No application geometry is accepted from f32 output.
import { arithmeticCheck } from "./surface-arithmetic.mjs";
export async function surfaceGpu({ patches, shader, counts, rounds = 5, precise = false }) {
  if (!navigator.gpu) return { unavailable: "navigator.gpu is absent" };
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return { unavailable: "No WebGPU adapter" };
  const info = adapter.info;
  const metadata = Object.fromEntries(
    ["vendor", "architecture", "device", "description", "backend", "type", "isFallbackAdapter"].map(
      (key) => [key, info[key]],
    ),
  );
  if (
    info.isFallbackAdapter ||
    info.type === "CPU" ||
    /swiftshader|llvmpipe/i.test(info.description)
  )
    return { unavailable: "Software adapter; hardware benchmark rejected", adapter: metadata };
  const device = await adapter.requestDevice({
    requiredFeatures: adapter.features.has("timestamp-query") ? ["timestamp-query"] : [],
  });
  const errors = [];
  device.addEventListener("uncapturederror", (event) => errors.push(event.error.message));
  const start = performance.now();
  const module = device.createShaderModule({ code: shader });
  const messages = (await module.getCompilationInfo()).messages;
  if (messages.some((m) => m.type === "error"))
    throw new Error(messages.map((m) => m.message).join("\n"));
  const pipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });
  const compilationMs = performance.now() - start;
  const packingStart = performance.now();
  const packed = pack(patches, precise);
  const packingMs = performance.now() - packingStart;
  const results = [];
  try {
    for (const count of counts)
      results.push(await measure(device, pipeline, packed, count, rounds));
    if (errors.length) throw new Error(errors.join("\n"));
    const arithmetic = precise ? await arithmeticCheck(device, shader) : undefined;
    return { adapter: metadata, compilationMs, packingMs, arithmetic, results };
  } finally {
    device.destroy();
  }
}

function pack(patches, precise) {
  const metadata = new Uint32Array(patches.length * 4);
  const values = [];
  patches.forEach((patch, index) => {
    if (patch.nu > 26 || patch.nv > 26) throw new Error("Patch degree exceeds shader capacity");
    metadata.set([values.length / 4, patch.nu, patch.nv, 0], index * 4);
    const origin = patch.poles[0];
    for (const [x, y, z, w] of patch.poles) {
      const components = [(x - origin[0]) * w, (y - origin[1]) * w, (z - origin[2]) * w, w];
      values.push(...components.map(Math.fround));
      if (precise) values.push(...components.map((value) => value - Math.fround(value)));
    }
  });
  return { metadata, poles: new Float32Array(values), stride: precise ? 96 : 48 };
}

async function measure(device, pipeline, packed, count, rounds) {
  const setup = performance.now();
  const inputs = [packed.metadata, packed.poles].map((data) =>
    device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
  );
  const output = device.createBuffer({
    size: count * packed.stride,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readback = device.createBuffer({
    size: count * packed.stride,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [...inputs, output].map((buffer, binding) => ({ binding, resource: { buffer } })),
  });
  const setupMs = performance.now() - setup;
  const samples = [];
  let data;
  try {
    for (let round = 0; round <= rounds; round++) {
      const start = performance.now();
      device.queue.writeBuffer(inputs[0], 0, packed.metadata);
      device.queue.writeBuffer(inputs[1], 0, packed.poles);
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.ceil(count / 64));
      pass.end();
      encoder.copyBufferToBuffer(output, 0, readback, 0, count * packed.stride);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      data = new Float32Array(readback.getMappedRange().slice(0));
      readback.unmap();
      samples.push(performance.now() - start);
    }
    // Array conversion is outside the transfer-inclusive measurements.
    const gpuMs = await timestamp(device, pipeline, bind, count);
    return {
      count,
      setupMs,
      gpuMs,
      firstMs: samples[0],
      milliseconds: samples.slice(1),
      values: Array.from(data),
    };
  } finally {
    for (const buffer of [...inputs, output, readback]) buffer.destroy();
  }
}

async function timestamp(device, pipeline, bind, count) {
  if (!device.features.has("timestamp-query")) return null;
  const query = device.createQuerySet({ type: "timestamp", count: 2 });
  const resolved = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  });
  const readback = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  try {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass({
      timestampWrites: {
        querySet: query,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      },
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(count / 64));
    pass.end();
    encoder.resolveQuerySet(query, 0, 2, resolved, 0);
    encoder.copyBufferToBuffer(resolved, 0, readback, 0, 16);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const times = new BigUint64Array(readback.getMappedRange());
    return Number(times[1] - times[0]) / 1e6;
  } finally {
    query.destroy();
    resolved.destroy();
    readback.destroy();
  }
}
