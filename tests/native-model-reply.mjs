import { resolve } from "node:path";
import { electronSession } from "./native-documents.mjs";

/** Hold delivery after the real owner completes; leave geometry and IPC checks intact. */
export async function holdAcceptanceReply(page) {
  const session = electronSession(page);
  if (session) {
    const url = resolve(".build/host/host/document-session.js");
    await session.app.evaluate(async ({ BrowserWindow }, url) => {
      const require = process.getBuiltinModule("module").createRequire(url);
      const { DocumentSession } = require(url);
      const original = DocumentSession.prototype.model;
      const hold = { original, prototype: DocumentSession.prototype };
      globalThis.navigationReplyHold = hold;
      DocumentSession.prototype.model = async function (request) {
        const reply = await original.call(this, request);
        if (request.kind === "accept") {
          await BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(
            "window.navigationAcceptanceReady = true",
          );
          await new Promise((resolve) => {
            hold.release = resolve;
          });
        }
        return reply;
      };
    }, url);
    return {
      release: () => session.app.evaluate(() => globalThis.navigationReplyHold.release?.()),
      restore: () =>
        session.app.evaluate(() => {
          const hold = globalThis.navigationReplyHold;
          hold.release?.();
          hold.prototype.model = hold.original;
          delete globalThis.navigationReplyHold;
        }),
    };
  }
  await page.evaluate(() => {
    window.navigationActualModel =
      window.makeshiftModel ??
      (async (request) => {
        const response = await fetch("/sketch-api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        return response.json();
      });
    window.makeshiftModel = async (request) => {
      const reply = await window.navigationActualModel(request);
      if (request.kind === "accept") {
        window.navigationAcceptanceReady = true;
        await new Promise((resolve) => {
          window.releaseNavigationReply = resolve;
        });
      }
      return reply;
    };
  });
  return {
    release: () => page.evaluate(() => window.releaseNavigationReply()),
    restore: () =>
      page.evaluate(() => {
        window.releaseNavigationReply?.();
        window.makeshiftModel = window.navigationActualModel;
        delete window.navigationActualModel;
      }),
  };
}
