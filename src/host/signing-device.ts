import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { app, type BrowserWindow, nativeImage, safeStorage } from "electron";
import type { Author, Grant, TrustDevice, TrustPrompt } from "../security/content-trust.js";
import { fingerprintTiles } from "../security/fingerprint.js";
import { createIdentity, type Identity, signContent } from "../security/identity.js";
import { fingerprint, type Scope } from "../security/signatures.js";
import { safeName } from "../security/text.js";
import { safeWrite } from "./safe-write.js";
import { sessionDialogs } from "./session-dialogs.js";

function read(path: string) {
  try {
    return readFileSync(join(app.getPath("userData"), path), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return null;
  }
}
function displayName() {
  const user = userInfo().username;
  try {
    const full =
      process.platform === "darwin"
        ? execFileSync("/usr/bin/id", ["-F"], { encoding: "utf8", timeout: 1500 })
        : process.platform === "linux"
          ? readFileSync("/etc/passwd", "utf8")
              .split("\n")
              .find((line) => line.split(":")[0] === user)
              ?.split(":")[4]
              ?.split(",")[0]
          : undefined;
    return safeName(full?.trim() || user, "Author");
  } catch {
    return safeName(user, "Author");
  }
}
let queue = Promise.resolve();
export function signingUpdate<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.then(action);
  queue = result.then(
    () => {},
    () => {},
  );
  return result;
}
function secureStorage() {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")
  )
    throw new Error("Unlock your system key store to use your signing identity.");
}
export async function storeIdentity(identity: Identity) {
  secureStorage();
  const data = safeStorage.encryptString(JSON.stringify(identity)).toString("base64");
  await safeWrite(join(app.getPath("userData"), "signing-identity"), data, 0o600);
}
export function getIdentity(): Promise<Identity> {
  return signingUpdate(async () => {
    secureStorage();
    const data = read("signing-identity");
    if (data) return JSON.parse(safeStorage.decryptString(Buffer.from(data, "base64"))) as Identity;
    const identity = await createIdentity(displayName());
    await storeIdentity(identity);
    return identity;
  });
}
export function grants(): Grant[] {
  return JSON.parse(read("content-trust.json") ?? "[]");
}
export function changeGrants(change: (items: Grant[]) => Grant[]) {
  return signingUpdate(() =>
    safeWrite(
      join(app.getPath("userData"), "content-trust.json"),
      JSON.stringify(change(grants())),
      0o600,
    ),
  );
}
function art(value: string) {
  const data = Buffer.alloc(17 * 9 * 4);
  fingerprintTiles(value).forEach((color, i) => {
    data.writeUInt32LE(Number.parseInt("ff" + color.slice(1), 16), i * 4);
  });
  return nativeImage
    .createFromBitmap(data, { width: 17, height: 9 })
    .resize({ width: 136, height: 72, quality: "good" });
}
export function signingDevice(window: () => BrowserWindow): TrustDevice {
  return {
    async identity() {
      const { name, key } = await getIdentity();
      return { name, key };
    },
    async sign(scope: Scope, digest: string, author: Author) {
      return signContent(await getIdentity(), scope, digest, author);
    },
    async grants() {
      return grants();
    },
    grant: (value) =>
      changeGrants((items) => [
        ...items.filter(
          (g) => !(g.key === value.key && g.scope === value.scope && g.digest === value.digest),
        ),
        value,
      ]),
    async ask(prompt: TrustPrompt) {
      const value = prompt.key ? await fingerprint(prompt.key) : undefined;
      const { response } = await sessionDialogs.showMessageBox(window(), {
        type: "warning",
        message: prompt.message,
        detail: prompt.detail + (value ? "\n\n" + value : ""),
        ...(value ? { icon: art(value), fingerprint: value } : {}),
        buttons: prompt.buttons,
        defaultId: 0,
        cancelId: Math.max(0, prompt.buttons.indexOf("Cancel save")),
        noLink: true,
      });
      return response;
    },
  };
}
