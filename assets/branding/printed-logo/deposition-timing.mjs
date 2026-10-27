// Timing uses extrusion volume inferred by the G-code parser, not mesh face counts
// or the icon's deliberately exaggerated bead cross-section.
export const startupTiming = {
  fps: 60,
  macroSeconds: 1,
  pullbackSeconds: 0.9,
  pullbackLeadSeconds: 0.25,
  firstLayerSeconds: 0.75,
  printSeconds: 1.6,
  renderSeconds: 3,
};

export function segmentVolumes(path) {
  return path.points.slice(1).map((point, index) => {
    const length = Math.hypot(...point.map((value, axis) => value - path.points[index][axis]));
    const area = path.height * (path.volumeWidths[index] - path.height * (1 - Math.PI / 4));
    const volume = length * area;
    if (!(volume > 0 && Number.isFinite(volume))) throw new Error("Invalid deposition volume");
    return volume;
  });
}

export function prefixByVolume(path, volumes, target) {
  const points = [path.points[0]],
    widths = [],
    volumeWidths = [];
  let remaining = target;
  for (let index = 0; index < volumes.length && remaining > 1e-10; index++) {
    const fraction = Math.min(1, remaining / volumes[index]);
    points.push(
      path.points[index].map(
        (value, axis) => value + (path.points[index + 1][axis] - value) * fraction,
      ),
    );
    widths.push(path.widths[index]);
    volumeWidths.push(path.volumeWidths[index]);
    remaining -= volumes[index] * fraction;
  }
  if (points.length < 2) throw new Error("Empty deposition prefix");
  return { ...path, points, widths, volumeWidths };
}

export function depositionPlan(paths, timing = startupTiming) {
  const segments = paths.map(segmentVolumes);
  const volumes = segments.map((values) => values.reduce((sum, value) => sum + value, 0));
  const layers = [];
  for (const [index, path] of paths.entries()) {
    if (layers.at(-1)?.z !== path.z) {
      if (layers.length && path.z <= layers.at(-1).z) throw new Error("Non-monotone slice layers");
      layers.push({ z: path.z, firstPath: index, endPath: index, volume: 0 });
    }
    layers.at(-1).endPath = index + 1;
    layers.at(-1).volume += volumes[index];
  }
  if (layers.length < 2 || timing.firstLayerSeconds >= timing.printSeconds)
    throw new Error("Expected multiple layers and a positive remaining print interval");
  const interval = (timing.printSeconds - timing.firstLayerSeconds) / (layers.length - 1);
  for (const [index, layer] of layers.entries()) {
    layer.start = index === 0 ? 0 : timing.firstLayerSeconds + (index - 1) * interval;
    layer.end =
      index === 0 ? timing.firstLayerSeconds : timing.firstLayerSeconds + index * interval;
  }
  const frames = [];
  for (let frame = 1; frame <= Math.round(timing.printSeconds * timing.fps); frame++) {
    const time = frame / timing.fps;
    const layerIndex = layers.findIndex((layer) => time <= layer.end + 1e-10);
    const layer = layers[layerIndex];
    const fraction = Math.min(1, (time - layer.start) / (layer.end - layer.start));
    let remaining = layer.volume * fraction;
    let completePaths = layer.firstPath;
    while (completePaths < layer.endPath && remaining >= volumes[completePaths] - 1e-9) {
      remaining -= volumes[completePaths++];
    }
    const partial =
      remaining > 1e-9
        ? prefixByVolume(paths[completePaths], segments[completePaths], remaining)
        : null;
    frames.push({
      frame,
      layerIndex,
      fraction,
      completePaths,
      partial,
      depositedVolume:
        volumes.slice(0, layer.firstPath).reduce((a, b) => a + b, 0) + layer.volume * fraction,
    });
  }
  return { layers, frames: macroOpening(frames, paths, segments, timing), volumes };
}

function macroOpening(frames, paths, segments, timing) {
  const count = Math.round(timing.macroSeconds * timing.fps);
  const first = frames[0];
  if (first.completePaths !== 0) throw new Error("Macro opening must remain on the first path");
  const opening = Array.from({ length: count }, (_, index) => {
    const depositedVolume = (first.depositedVolume * index) / count;
    return {
      frame: index + 1,
      layerIndex: 0,
      fraction: (first.fraction * index) / count,
      completePaths: 0,
      partial: index ? prefixByVolume(paths[0], segments[0], depositedVolume) : null,
      depositedVolume,
    };
  });
  return [...opening, ...frames.map((frame) => ({ ...frame, frame: frame.frame + count }))];
}
