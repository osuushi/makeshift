import type { Author, Grant } from "./content-trust.js";
import { backup, type Identity, restore } from "./identity.js";
import { decode } from "./signatures.js";
import { validName } from "./text.js";
export interface SecuritySettings {
  info(): Promise<{ author?: Author; error?: string; grants: Grant[] }>;
  rename(name: string): Promise<void>;
  forget(grant: Grant): Promise<void>;
  exportKey(password: string): Promise<string>;
  importKey(data: string, password: string): Promise<void>;
  trust(grant: Grant): Promise<void>;
}
declare global {
  interface Window {
    makeshiftSecurity?: SecuritySettings;
  }
}
export function identitySettings(
  read: () => Promise<Identity>,
  write: (value: Identity) => Promise<void>,
  grants: () => Promise<Grant[]>,
  modify: (change: (items: Grant[]) => Grant[]) => Promise<void>,
): SecuritySettings {
  return {
    async info() {
      const trusted = await grants();
      try {
        const { name, key } = await read();
        return { author: { name, key }, grants: trusted };
      } catch (error) {
        return { error: String(error), grants: trusted };
      }
    },
    async rename(name) {
      if (!validName(name))
        throw new Error("Use up to 96 printable characters for your public name.");
      await write({ ...(await read()), name: name.trim() });
    },
    async forget(grant) {
      await modify((items) =>
        items.filter(
          (g) => g.key !== grant.key || g.scope !== grant.scope || g.digest !== grant.digest,
        ),
      );
    },
    async exportKey(password) {
      return backup(await read(), password);
    },
    async importKey(data, password) {
      await write(await restore(data, password));
    },
    async trust(grant) {
      if (
        !validName(grant.name) ||
        !["workspace", "decorators"].includes(grant.scope) ||
        !/^[A-Za-z0-9+/]{43}=$/.test(grant.key) ||
        grant.digest !== undefined
      )
        throw new Error("Invalid public key or trust scope.");
      await crypto.subtle.importKey("raw", decode(grant.key), "Ed25519", false, ["verify"]);
      await modify((items) => [
        ...items.filter((g) => g.key !== grant.key || g.scope !== grant.scope || g.digest),
        { name: grant.name, key: grant.key, scope: grant.scope },
      ]);
    },
  };
}
