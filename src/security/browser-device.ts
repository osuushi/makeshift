import type { Grant, TrustDevice, TrustPrompt } from "./content-trust.js";
import { DrawingTrust } from "./drawing-trust.js";
import { fingerprintSvg } from "./fingerprint.js";
import { createIdentity, type Identity, signContent } from "./identity.js";
import { identitySettings } from "./settings-api.js";
import { fingerprint } from "./signatures.js";

// IndexedDB can retain a non-extractable wrapping key. The portable backup has a separate passphrase.
async function vault(mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest) {
  const db = await new Promise<IDBDatabase>((ok, fail) => {
    const r = indexedDB.open("makeshift-signing", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("identity");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
  try {
    return await new Promise<unknown>((ok, fail) => {
      const tx = db.transaction("identity", mode),
        request = action(tx.objectStore("identity"));
      tx.oncomplete = () => ok(request.result);
      tx.onabort = () => fail(tx.error);
      tx.onerror = () => fail(tx.error);
    });
  } finally {
    db.close();
  }
}
interface Stored {
  key: CryptoKey;
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}
async function storeIdentity(identity: Identity) {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(identity)),
  );
  await vault("readwrite", (s) => s.put({ key, iv, data }, "local"));
}
async function readIdentity(): Promise<Identity> {
  return navigator.locks.request("makeshift-signing-identity", async () => {
    const saved = (await vault("readonly", (s) => s.get("local"))) as Stored | undefined;
    if (saved)
      return JSON.parse(
        new TextDecoder().decode(
          await crypto.subtle.decrypt({ name: "AES-GCM", iv: saved.iv }, saved.key, saved.data),
        ),
      );
    const identity = await createIdentity("Author");
    await storeIdentity(identity);
    return identity;
  });
}
const grants = async (): Promise<Grant[]> =>
  JSON.parse(localStorage.getItem("makeshift.content-trust") ?? "[]");
const update = (change: (items: Grant[]) => Grant[]) =>
  navigator.locks.request("makeshift-content-grants", async () => {
    localStorage.setItem("makeshift.content-trust", JSON.stringify(change(await grants())));
  });
export const browserSettings = identitySettings(
  readIdentity,
  (value) => navigator.locks.request("makeshift-signing-identity", () => storeIdentity(value)),
  grants,
  update,
);
export async function browserAsk(prompt: TrustPrompt): Promise<number> {
  const dialog = document.createElement("dialog");
  dialog.className = "content-trust-dialog";
  const title = document.createElement("h2"),
    detail = document.createElement("p");
  title.textContent = prompt.message;
  detail.textContent = prompt.detail;
  dialog.append(title, detail);
  if (prompt.key) {
    const fp = await fingerprint(prompt.key),
      code = document.createElement("code"),
      img = document.createElement("img");
    img.src = "data:image/svg+xml," + encodeURIComponent(fingerprintSvg(fp));
    img.alt = "Public key fingerprint";
    code.textContent = fp;
    dialog.append(img, code);
  }
  return new Promise((resolve) => {
    const finish = (index: number) => {
      dialog.close();
      dialog.remove();
      resolve(index);
    };
    prompt.buttons.forEach((label, index) => {
      const button = document.createElement("button");
      button.textContent = label;
      button.onclick = () => finish(index);
      dialog.append(button);
    });
    dialog.oncancel = (e) => {
      e.preventDefault();
      finish(Math.max(0, prompt.buttons.indexOf("Cancel save")));
    };
    document.body.append(dialog);
    dialog.showModal();
  });
}
const device: TrustDevice = {
  async identity() {
    const { name, key } = await readIdentity();
    return { name, key };
  },
  async sign(scope, digest, author) {
    return signContent(await readIdentity(), scope, digest, author);
  },
  ask: browserAsk,
  grants,
  grant: (value) => update((items) => [...items, value]),
};
export let browserTrust = new DrawingTrust(device);
export function newBrowserTrust() {
  return new DrawingTrust(device);
}
export function adoptBrowserTrust(trust: DrawingTrust) {
  browserTrust = trust;
}
