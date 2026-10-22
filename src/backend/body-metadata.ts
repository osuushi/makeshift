import { continueDecorators } from "../decorators/continuation.js";
import { continueGuides } from "../guides/continuation.js";
import { continueBodyAppearances } from "../model/body-appearance.js";
import type { DisplayDocument } from "../model/display-document.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import { continueTags } from "../tags/continuation.js";

export function continueBodyMetadata<T extends DisplayDocument>(
  source: SketchDocument,
  candidate: T,
  request?: ModelRequest,
): T {
  return continueBodyAppearances(
    source,
    continueGuides(source, continueTags(source, continueDecorators(source, candidate, request))),
  );
}
