import { archiveLimits } from "../model/portable-files.js";
import { type AgentHost, attachmentWarningBytes } from "./protocol.js";

function terminalPath(path: string): string {
  return /[^A-Za-z0-9_./-]/.test(path) ? `'${path.replaceAll("'", "'\\''")}'` : path;
}

function confirmLargeFiles(panel: HTMLElement, bytes: number): Promise<boolean> {
  const dialog = document.createElement("dialog");
  dialog.className = "agent-attachment-warning";
  const size = (bytes / (1024 * 1024)).toFixed(1);
  dialog.innerHTML = `<form method="dialog"><p>These files total ${size} MiB. They will be bundled in the saved Makeshift drawing and make it larger.</p><div><button value="cancel">Cancel</button><button value="import">Attach files</button></div></form>`;
  panel.append(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        resolve(dialog.returnValue === "import");
        dialog.remove();
      },
      { once: true },
    );
    dialog.showModal();
  });
}

export function agentAttachments(
  panel: HTMLElement,
  host: AgentHost,
  action: (run: () => Promise<void>) => Promise<void>,
  insert: (value: string) => void,
  running: () => boolean,
): { choose: () => void; attach: (files: File[]) => void; dispose: () => void } {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.hidden = true;
  input.setAttribute("aria-label", "Choose files to attach");
  panel.append(input);

  const attach = (files: File[]) => {
    if (!files.length) return;
    void action(async () => {
      if (!running()) throw new Error("Start the agent before attaching files.");
      const size = files.reduce((sum, file) => sum + file.size, 0);
      if (size > archiveLimits.bytes)
        throw new Error("These files exceed the drawing's 2 GiB workspace limit.");
      if (window.makeshiftRemote && files.some((file) => file.size > 23 * 1024 * 1024))
        throw new Error(
          "The iPad connection supports files up to 23 MiB each. Attach larger files on the computer.",
        );
      if (size > attachmentWarningBytes && !(await confirmLargeFiles(panel, size))) return;
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 8192)
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        const reply = await host.request({ kind: "attach", name: file.name, base64: btoa(binary) });
        if (reply.error || !reply.attachment)
          throw new Error(reply.error ?? "The attachment path was not returned.");
        insert(`${terminalPath(reply.attachment)} `);
      }
    });
  };
  input.onchange = () => {
    const files = Array.from(input.files ?? []);
    input.value = "";
    attach(files);
  };
  const dragOver = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    panel.classList.add("agent-file-drop");
  };
  const dragLeave = (event: DragEvent) => {
    if (!panel.contains(event.relatedTarget as Node)) panel.classList.remove("agent-file-drop");
  };
  const drop = (event: DragEvent) => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    panel.classList.remove("agent-file-drop");
    attach(Array.from(event.dataTransfer.files));
  };
  panel.addEventListener("dragover", dragOver);
  panel.addEventListener("dragleave", dragLeave);
  panel.addEventListener("drop", drop);
  return {
    choose: () => input.click(),
    attach,
    dispose: () => {
      panel.removeEventListener("dragover", dragOver);
      panel.removeEventListener("dragleave", dragLeave);
      panel.removeEventListener("drop", drop);
      input.remove();
    },
  };
}
