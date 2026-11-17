import type { DisplayDocument } from "../model/display-document.js";
import type { PortableFiles } from "../model/portable-files.js";
import { ContentTrust } from "./content-trust.js";
import { decoratorDigest, portableDigest, type Seals } from "./signatures.js";

export class DrawingTrust extends ContentTrust {
  async opened(doc: DisplayDocument, files: PortableFiles, seals: Seals = {}) {
    await this.load("decorators", await decoratorDigest(doc), seals);
    await this.load("workspace", await portableDigest(files), seals);
  }
  async allowDecorators(doc: DisplayDocument) {
    const digest = await decoratorDigest(doc);
    return !!digest && (await this.authorize("decorators", digest)) === "allow";
  }
  async prepareSave(doc: DisplayDocument, files: PortableFiles) {
    const workspace = await portableDigest(files),
      decorators = await decoratorDigest(doc);
    const seals: Seals = {};
    const agent = await this.publish("workspace", workspace);
    const code = await this.publish("decorators", decorators);
    if (agent !== undefined) seals.workspace = agent;
    if (code !== undefined) seals.decorators = code;
    return {
      seals,
      saved: async () => {
        await this.load("workspace", workspace, seals);
        await this.load("decorators", decorators, seals);
      },
    };
  }
}
export function usedDefinitions(doc: DisplayDocument) {
  return (doc.decoratorDefinitions ?? []).filter((def) =>
    doc.decorators?.some((inst) => inst.definition === def.id && inst.version === def.version),
  );
}
