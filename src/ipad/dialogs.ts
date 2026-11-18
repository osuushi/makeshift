import { fingerprintSvg } from "../security/fingerprint.js";
import type { DialogRequest, DirectoryListing } from "./protocol.js";
import type { Rpc } from "./rpc.js";

export function showRemoteDialog(request: DialogRequest, rpc: Rpc): Promise<unknown> {
  const dialog = document.createElement("dialog");
  dialog.className = "ipad-dialog";
  const title = document.createElement("h2");
  title.textContent =
    request.kind === "message"
      ? request.message
      : (request.title ?? (request.kind === "save" ? "Save on computer" : "Open on computer"));
  dialog.append(title);
  return new Promise((resolve) => {
    const finish = (value: unknown) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(request.kind === "message" ? (request.cancelId ?? request.buttons.length - 1) : null);
    });
    if (request.kind === "message") {
      const detail = document.createElement("p");
      detail.textContent = request.detail ?? "";
      dialog.append(detail);
      if (request.fingerprint) {
        const img = document.createElement("img");
        img.alt = "Public key fingerprint";
        img.src = "data:image/svg+xml," + encodeURIComponent(fingerprintSvg(request.fingerprint));
        dialog.append(img);
      }
      request.buttons.forEach((label, index) => {
        dialog.append(button(label, () => finish(index)));
      });
    } else fileDialog(dialog, request, rpc, finish);
    document.body.append(dialog);
    dialog.showModal();
  });
}

function fileDialog(
  dialog: HTMLDialogElement,
  request: Exclude<DialogRequest, { kind: "message" }>,
  rpc: Rpc,
  finish: (path: string | null) => void,
): void {
  const hint = document.createElement("p");
  hint.textContent = "Files on the computer running Makeshift";
  const path = document.createElement("input");
  path.setAttribute("aria-label", "Computer folder path");
  const list = document.createElement("div");
  list.className = "ipad-file-list";
  const name = document.createElement("input");
  name.setAttribute("aria-label", request.directory ? "Selected folder" : "File name");
  const error = document.createElement("p");
  error.setAttribute("role", "status");
  let directory: DirectoryListing | null = null;
  let selected: string | null = null;
  let loading = false;
  const choose = button(request.kind === "save" ? "Save" : "Open", () => {
    if (!directory || loading) return;
    if (request.directory) {
      finish(selected ?? directory.path);
      return;
    }
    let filename = name.value.trim();
    if (!filename) return;
    const extension = request.extensions?.[0];
    if (request.kind === "save" && extension && !filename.toLowerCase().endsWith(`.${extension}`))
      filename += `.${extension}`;
    const separator = directory.path.includes("\\") ? "\\" : "/";
    finish(directory.path.replace(/[\\/]$/, "") + separator + filename);
  });
  const load = async (target?: string) => {
    if (loading) return;
    loading = true;
    choose.disabled = true;
    error.textContent = "Loading…";
    try {
      directory = await rpc.request<DirectoryListing>("directory", target);
      path.value = directory.path;
      selected = null;
      list.replaceChildren();
      list.append(button("↑ Parent folder", () => void load(directory?.parent)));
      for (const entry of directory.entries) {
        if (!entry.directory && request.directory) continue;
        if (
          !entry.directory &&
          request.extensions?.length &&
          !request.extensions.includes("*") &&
          !request.extensions.some((ext) =>
            entry.name.toLowerCase().endsWith(`.${ext.toLowerCase()}`),
          )
        )
          continue;
        list.append(
          button(`${entry.directory ? "▸ " : ""}${entry.name}`, () => {
            if (entry.directory) void load(entry.path);
            else {
              name.value = entry.name;
              selected = entry.path;
            }
          }),
        );
      }
      error.textContent = "";
    } catch (reason) {
      error.textContent = String(reason);
    } finally {
      loading = false;
      choose.disabled = !directory;
    }
  };
  path.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void load(path.value);
    }
  });
  dialog.append(
    hint,
    path,
    button("Go", () => void load(path.value)),
    list,
  );
  if (!request.directory) dialog.append(name);
  dialog.append(
    error,
    choose,
    button("Cancel", () => finish(null)),
  );
  if (request.kind === "save")
    name.value = request.defaultPath?.split(/[\\/]/).at(-1) ?? "Untitled.makeshift";
  void load(request.defaultPath);
}
function button(label: string, action: () => void): HTMLButtonElement {
  const result = document.createElement("button");
  result.textContent = label;
  result.type = "button";
  result.onclick = action;
  return result;
}
