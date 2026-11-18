import { isBuiltinDecorator } from "../decorators/builtins.js";
import { gearDefinition } from "../decorators/gear-settings.js";
import type { DisplayDocument } from "../model/display-document.js";
import type { PortableFiles } from "../model/portable-files.js";
import { validName } from "./text.js";

export type Scope = "workspace" | "decorators";
export interface Seal {
  version: 1;
  name: string;
  key: string;
  digest: string;
  signature: string;
}
export type Seals = Partial<Record<Scope, Seal>>;
const utf8 = new TextEncoder();
export function base64(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(Array.from(new Uint8Array(bytes), (n) => String.fromCharCode(n)).join(""));
}
export function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function hash(bytes: Uint8Array): Promise<string> {
  return base64(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
}
export function decoratorContent(doc: DisplayDocument) {
  const definitions = doc.decoratorDefinitions ?? [];
  const instances = (doc.decorators ?? []).filter(
    (d) => d.definition !== gearDefinition && !isBuiltinDecorator(d.definition),
  );
  if (!definitions.length && !instances.length) return null;
  return {
    definitions,
    instances,
    choices: Object.fromEntries(
      definitions.flatMap((d) => {
        const key = d.id + "/" + d.version;
        const choice = doc.lastDecoratorChoices?.[key];
        return choice ? [[key, choice]] : [];
      }),
    ),
    presets: (doc.decoratorPresets ?? []).filter(
      (p) => p.definition !== gearDefinition && !isBuiltinDecorator(p.definition),
    ),
  };
}
export async function decoratorDigest(doc: DisplayDocument): Promise<string | undefined> {
  const value = decoratorContent(doc);
  if (!value) return undefined;
  // Sort object keys recursively. Arrays retain their meaningful order.
  return hash(
    utf8.encode(
      JSON.stringify(value, (_k, v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, v[k]]),
            )
          : v,
      ),
    ),
  );
}
export async function portableDigest(files: PortableFiles): Promise<string | undefined> {
  const paths = Object.keys(files).sort();
  if (!paths.length) return undefined;
  const entries = [];
  for (const path of paths) entries.push([path, await hash(files[path])]);
  return hash(utf8.encode(JSON.stringify(entries)));
}
export function signedMessage(
  scope: Scope,
  seal: Omit<Seal, "signature">,
): Uint8Array<ArrayBuffer> {
  return utf8.encode(
    JSON.stringify(["Makeshift signed content", 1, scope, seal.name, seal.key, seal.digest]),
  );
}
export async function verified(
  scope: Scope,
  digest: string | undefined,
  seal: Seal | undefined,
): Promise<boolean> {
  try {
    if (
      !seal ||
      seal.version !== 1 ||
      !validName(seal.name) ||
      seal.digest !== digest ||
      typeof digest !== "string" ||
      typeof seal.key !== "string" ||
      seal.key.length !== 44 ||
      typeof seal.signature !== "string" ||
      seal.signature.length !== 88
    )
      return false;
    const bytes = decode(seal.key);
    if (base64(bytes) !== seal.key || bytes.length !== 32) return false;
    const key = await crypto.subtle.importKey("raw", bytes, "Ed25519", false, ["verify"]);
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      decode(seal.signature),
      signedMessage(scope, seal),
    );
  } catch {
    return false;
  }
}
export function sshBlob(key: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0, 0, 0, 11, ...utf8.encode("ssh-ed25519"), 0, 0, 0, 32, ...decode(key)]);
}
export async function fingerprint(key: string): Promise<string> {
  return "SHA256:" + (await hash(sshBlob(key))).replace(/=+$/, "");
}
