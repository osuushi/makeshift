import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { net, session } from "electron";
import { previewPath } from "./preview-files.js";

export function previewSession(root: string): Electron.Session {
  const isolated = session.fromPartition(`preview-${randomUUID()}`);
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.on("will-download", (event) => event.preventDefault());
  isolated.protocol.handle("https", async (request) => {
    const url = new URL(request.url);
    if (url.origin !== "https://preview.local") return new Response("Blocked", { status: 403 });
    try {
      const path = await previewPath(root, `.${decodeURIComponent(url.pathname)}`);
      return await net.fetch(pathToFileURL(path).href);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  isolated.webRequest.onBeforeRequest((details, callback) =>
    callback({
      cancel:
        !details.url.startsWith("https://preview.local/") &&
        !details.url.startsWith("data:") &&
        !details.url.startsWith("blob:"),
    }),
  );
  return isolated;
}
