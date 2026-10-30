import type { DisplayDocument } from "../model/display-document.js";
import { threadDefinition } from "./thread-settings.js";
import { threadTexture } from "./thread-texture.js";
import type { DecoratorInstance } from "./types.js";

/** Optional decorator-owned texture implementation; undefined uses ordinary mesh projection. */
export function decoratorTexture(document: DisplayDocument, instance: DecoratorInstance) {
  return instance.definition === threadDefinition ? threadTexture(document, instance) : undefined;
}
