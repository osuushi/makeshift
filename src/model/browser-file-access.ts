interface WritableFile {
  write(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}
export interface BrowserFileHandle {
  name: string;
  createWritable(): Promise<WritableFile>;
}
interface SavePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<BrowserFileHandle>;
}

/** Call from the user gesture, before encoding the archive consumes activation. */
export function pickSaveFile(name: string): Promise<BrowserFileHandle | undefined> {
  const host = window as SavePickerWindow;
  return (
    host.showSaveFilePicker?.({
      suggestedName: name,
      types: [
        {
          description: "Makeshift drawing",
          accept: { "application/octet-stream": [".makeshift"] },
        },
      ],
    }) ?? Promise.resolve(undefined)
  );
}

export async function writeBrowserFile(
  handle: BrowserFileHandle,
  bytes: Uint8Array,
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

export function confirmReplacement(save: () => Promise<boolean>): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "Unsaved changes");
    dialog.innerHTML = `<h2>Save changes?</h2><p>Save your drawing before replacing it.</p>
      <button data-save>Save</button> <button data-cancel>Cancel</button> <button data-discard>Don’t Save</button>`;
    const finish = (result: boolean) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    const saveButton = dialog.querySelector<HTMLButtonElement>("[data-save]");
    const cancelButton = dialog.querySelector<HTMLButtonElement>("[data-cancel]");
    const discardButton = dialog.querySelector<HTMLButtonElement>("[data-discard]");
    if (!saveButton || !cancelButton || !discardButton)
      throw new Error("Missing save dialog controls");
    saveButton.onclick = () => {
      for (const button of dialog.querySelectorAll("button")) button.disabled = true;
      void save().then(finish, () => finish(false));
    };
    cancelButton.onclick = () => finish(false);
    discardButton.onclick = () => finish(true);
    document.body.append(dialog);
    dialog.showModal();
    cancelButton.focus();
  });
}
