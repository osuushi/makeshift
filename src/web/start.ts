import { DocumentOwner } from "../backend/document-owner.js";

export function installWebModel(): void {
  const owner = new DocumentOwner();
  window.makeshiftModel = async (request) =>
    structuredClone(await owner.call(structuredClone(request)));
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
