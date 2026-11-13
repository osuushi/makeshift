import { threadTolerance } from "./precision.js";
import type { ThreadSettings } from "./thread-settings.js";

export interface ThreadPreviewResolution {
  segments: number;
  samples: number;
}

/** Choose mesh density; adaptive overrides affect preview only. */
export function threadSampling(
  settings: ThreadSettings,
  depth: number,
  high: number,
  quality: "preview" | "export",
  previewResolution?: ThreadPreviewResolution,
) {
  const tolerance = quality === "preview" ? 0.08 : threadTolerance(settings);
  const baseSegments = Math.max(
    32,
    Math.ceil(Math.PI / Math.acos(1 - Math.min(0.1, tolerance / (2 * high)))),
  );
  const segments =
    quality === "preview" && previewResolution
      ? Math.max(12, Math.min(baseSegments, Math.round(previewResolution.segments)))
      : baseSegments;
  // Straight profile facets are aligned to crest/root corners in threadGrid.
  // The grid also splits at taper transitions and cone/profile intersections.
  // Each resulting straight-profile patch is linear in radius at fixed angle.
  const { pitch, profile, startTaper, endTaper } = settings;
  const profileSpan = profile === "metric" ? Math.sqrt(3) * pitch : 2 * depth;
  const taperSpan = Math.max(
    startTaper ? (depth * pitch) / startTaper : 0,
    endTaper ? (depth * pitch) / endTaper : 0,
  );
  const curvedSamples = Math.max(32, Math.ceil(Math.PI * Math.sqrt(depth / tolerance)));
  const mixedSamples = (span: number) => Math.ceil((span * Math.PI) / (segments * tolerance));
  const baseSamples =
    quality === "preview"
      ? 12
      : profile === "rounded"
        ? curvedSamples
        : Math.max(8, mixedSamples(profileSpan), Math.min(curvedSamples, mixedSamples(taperSpan)));
  const samples =
    quality === "preview" && previewResolution
      ? Math.max(6, Math.min(baseSamples, Math.round(previewResolution.samples)))
      : baseSamples;
  return { tolerance, segments, samples };
}
