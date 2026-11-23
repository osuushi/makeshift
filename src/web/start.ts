import { DocumentOwner } from "../backend/document-owner.js";
import type {} from "../model/fixture-host.js";
import { browserTrust } from "../security/browser-device.js";
import { modelWireReply } from "../sketch/model-wire.js";

export const webOwner = new DocumentOwner();

export function installWebModel(): void {
  const owner = webOwner;
  owner.setDecoratorAuthorization((doc) => browserTrust.allowDecorators(doc));
  window.makeshiftModel = async (request) => {
    await owner.initialize();
    return structuredClone(modelWireReply(request, await owner.call(structuredClone(request))));
  };
  window.makeshiftFixture = async (snapshot) => {
    const capturedAt = new Date().toISOString();
    return {
      path: "",
      name: `makeshift-fixture-${capturedAt.replace(/[:.]/g, "-")}.json`,
      contents: JSON.stringify(
        { format: "freac-fixture", version: 1, capturedAt, snapshot },
        null,
        2,
      ),
    };
  };
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) owner.close();
  });
}
