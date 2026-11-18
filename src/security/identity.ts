import type { Author } from "./content-trust.js";
import { base64, decode, type Scope, signedMessage, verified } from "./signatures.js";
import { validName } from "./text.js";

export interface Identity extends Author {
  privateKey: JsonWebKey;
}
export async function createIdentity(name: string): Promise<Identity> {
  const pair = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return {
    name,
    key: base64(await crypto.subtle.exportKey("raw", pair.publicKey)),
    privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey),
  };
}
export async function signContent(
  identity: Identity,
  scope: Scope,
  digest: string,
  author: Author,
) {
  if (identity.key !== author.key || identity.name !== author.name)
    throw new Error("Your signing identity changed. Try saving again.");
  const key = await crypto.subtle.importKey("jwk", identity.privateKey, "Ed25519", false, ["sign"]);
  const seal = { version: 1 as const, key: author.key, name: author.name, digest };
  return {
    ...seal,
    signature: base64(await crypto.subtle.sign("Ed25519", key, signedMessage(scope, seal))),
  };
}
async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  if (!password) throw new Error("Enter your backup passphrase.");
  const raw = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600000 },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function backup(identity: Identity, password: string) {
  if (password.length < 12) throw new Error("Use a backup passphrase of at least 12 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await passwordKey(password, salt),
    new TextEncoder().encode(JSON.stringify(identity)),
  );
  return JSON.stringify({
    format: "makeshift-private-key",
    version: 1,
    salt: base64(salt),
    iv: base64(iv),
    encrypted: base64(encrypted),
  });
}
export async function restore(bytes: string, password: string): Promise<Identity> {
  if (bytes.length > 16384) throw new Error("Invalid signing key backup.");
  const b = JSON.parse(bytes);
  if (b?.format !== "makeshift-private-key" || b.version !== 1)
    throw new Error("Invalid signing key backup.");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(b.iv) },
    await passwordKey(password, decode(b.salt)),
    decode(b.encrypted),
  );
  const identity: Identity = JSON.parse(new TextDecoder().decode(plain));
  if (!validName(identity.name)) throw new Error("Invalid author name.");
  const test = await signContent(identity, "workspace", "backup check", identity);
  if (!(await verified("workspace", "backup check", test)))
    throw new Error("Signing keys do not match.");
  return identity;
}
