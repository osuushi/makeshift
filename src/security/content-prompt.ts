import type { ContentPrompt } from "./content-trust.js";
import { fingerprintSvg } from "./fingerprint.js";

export function showContentPrompt(prompt: ContentPrompt): Promise<number> {
  const dialog = document.createElement("dialog");
  dialog.className = "content-trust-dialog";
  const title = document.createElement("h2");
  title.id = "trust-title";
  title.textContent = prompt.message;
  dialog.setAttribute("aria-labelledby", title.id);
  const content = document.createElement("div");
  content.className = "trust-content";
  const detail = document.createElement("p");
  detail.textContent = prompt.detail ?? "";
  content.append(detail);
  if (prompt.fingerprint) {
    content.classList.add("signed");
    const img = document.createElement("img");
    img.alt = "Public key fingerprint";
    img.width = img.height = 144;
    img.src = `data:image/svg+xml,${encodeURIComponent(fingerprintSvg(prompt.fingerprint))}`;
    const code = document.createElement("code");
    code.textContent = prompt.fingerprint;
    content.prepend(img);
    content.append(code);
  }
  const actions = document.createElement("div");
  actions.className = "trust-actions";
  dialog.append(title, content, actions);
  return new Promise((resolve) => {
    const finish = (index: number) => {
      dialog.close();
      dialog.remove();
      resolve(index);
    };
    prompt.buttons.forEach((label, index) => {
      const button = document.createElement("button");
      button.textContent = label;
      button.autofocus = index === 0;
      button.onclick = () => finish(index);
      actions.append(button);
    });
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(prompt.cancelId);
    };
    document.body.append(dialog);
    dialog.showModal();
  });
}
