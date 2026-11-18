import type { Author, Grant } from "../security/content-trust.js";
import { validName } from "../security/text.js";
import "./security-settings.css";
import { browserAsk, browserSettings } from "../security/browser-device.js";
import { fingerprintSvg } from "../security/fingerprint.js";
import { base64, decode, fingerprint, type Scope, sshBlob } from "../security/signatures.js";

function download(text: string, type: string, name: string) {
  const link = document.createElement("a"),
    url = URL.createObjectURL(new Blob([text], { type }));
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function securitySettings() {
  return new SecurityPanel().panel;
}
class SecurityPanel {
  private host = window.makeshiftSecurity ?? browserSettings;
  readonly panel = document.createElement("section");
  private status = document.createElement("p");
  private body = document.createElement("div");
  constructor() {
    this.panel.className = "security-settings";
    this.status.setAttribute("role", "status");
    this.panel.append(this.body, this.status);
    this.panel.addEventListener(
      "toggle",
      () => this.panel.dispatchEvent(new CustomEvent("security-size", { bubbles: true })),
      true,
    );
    new MutationObserver(() => {
      if (!this.panel.hidden) void this.show().catch(this.report);
    }).observe(this.panel, { attributeFilter: ["hidden"] });
  }
  private report = (e: unknown) => {
    this.status.textContent = String(e);
  };
  private button(parent: HTMLElement, text: string, fn: () => Promise<void>) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.onclick = () => {
      b.disabled = true;
      this.status.textContent = "";
      void fn()
        .catch((e) => {
          this.status.textContent = String(e);
        })
        .finally(() => {
          b.disabled = false;
        });
    };
    parent.append(b);
  }
  private input(parent: HTMLElement, label: string, type = "text") {
    const l = document.createElement("label"),
      i = document.createElement("input");
    l.textContent = label;
    i.type = type;
    if (type === "password") i.autocomplete = "off";
    l.append(i);
    parent.append(l);
    return i;
  }
  private async show() {
    const { author, grants, error } = await this.host.info();
    this.body.replaceChildren();
    if (author) await this.authorControls(author);
    this.transferControls();
    await this.trustedControls(grants);
    this.status.textContent = error ?? "";
    this.panel.dispatchEvent(new CustomEvent("security-size", { bubbles: true }));
  }
  private async authorControls(author: Author) {
    const fp = await fingerprint(author.key);
    const name = this.input(this.body, "Public author name");
    name.value = author.name;
    this.button(this.body, "Save name", async () => {
      await this.host.rename(name.value);
      await this.show();
    });
    const publicText = "ssh-ed25519 " + base64(sshBlob(author.key)) + " " + author.name;
    const img = document.createElement("img");
    img.alt = "Your public key fingerprint";
    img.src = "data:image/svg+xml," + encodeURIComponent(fingerprintSvg(fp));
    const code = document.createElement("code");
    code.textContent = fp;
    this.body.append(img, code);
    this.button(this.body, "Copy fingerprint", () => navigator.clipboard.writeText(fp));
    this.button(this.body, "Copy public key", () => navigator.clipboard.writeText(publicText));
    this.button(this.body, "Download fingerprint", async () =>
      download(fingerprintSvg(fp), "image/svg+xml", "makeshift-fingerprint.svg"),
    );
  }
  private transferControls() {
    const keys = document.createElement("details"),
      summary = document.createElement("summary");
    summary.textContent = "Transfer private key";
    keys.append(summary);
    this.body.append(keys);
    const warning = document.createElement("p");
    warning.textContent =
      "Anyone with your private key and passphrase can sign as you. Keep the backup private and store the passphrase separately.";
    keys.append(warning);
    const password = this.input(keys, "Backup passphrase", "password");
    this.button(keys, "Export encrypted private key", async () => {
      const encrypted = await this.host.exportKey(password.value);
      password.value = "";
      download(encrypted, "application/json", "makeshift-private-key.json");
    });
    const file = this.input(keys, "Encrypted backup", "file");
    file.accept = ".json";
    this.button(keys, "Import and replace my key", async () => {
      const chosen = file.files?.[0];
      if (!chosen || chosen.size > 16384) throw new Error("Choose a signing key backup.");
      if (
        (await browserAsk({
          message: "Replace your signing identity?",
          detail:
            "Future signatures will use the imported key. Export your current private key first if you want to keep it.",
          buttons: ["Cancel", "Replace my key"],
        })) !== 1
      )
        return;
      await this.host.importKey(await chosen.text(), password.value);
      password.value = "";
      await this.show();
    });
  }
  private async trustedControls(grants: Grant[]) {
    const trusted = document.createElement("details"),
      label = document.createElement("summary");
    label.textContent = "Trusted authors and versions";
    trusted.append(label);
    this.body.append(trusted);
    for (const grant of grants) {
      const row = document.createElement("p");
      row.textContent = [
        grant.name,
        grant.scope,
        grant.key ? await fingerprint(grant.key) : "Unsigned",
        grant.digest,
      ]
        .filter(Boolean)
        .join(" · ");
      this.button(row, "Forget", async () => {
        await this.host.forget(grant);
        await this.show();
      });
      trusted.append(row);
    }
    const key = this.input(trusted, "Published OpenSSH public key"),
      scope = document.createElement("select");
    scope.setAttribute("aria-label", "Trust scope");
    scope.add(new Option("Workspaces", "workspace"));
    scope.add(new Option("Custom decorators", "decorators"));
    trusted.append(scope);
    this.button(trusted, "Trust published key", async () => {
      const [algorithm, encoded, ...label] = key.value.trim().split(/\s+/);
      if (algorithm !== "ssh-ed25519" || !encoded || encoded.length !== 68)
        throw new Error("Paste an Ed25519 OpenSSH public key.");
      const raw = base64(decode(encoded).slice(-32));
      if (base64(sshBlob(raw)) !== encoded) throw new Error("Invalid public key.");
      const name = label.join(" ") || "Author";
      if (!validName(name)) throw new Error("Use a short printable author name after the key.");
      if (
        (await browserAsk({
          message: `Trust ${name} for ${scope.value}?`,
          detail: "Compare this fingerprint with the one published by the author.",
          key: raw,
          buttons: ["Cancel", "Trust author"],
        })) !== 1
      )
        return;
      await this.host.trust({ key: raw, name, scope: scope.value as Scope });
      await this.show();
    });
  }
}
