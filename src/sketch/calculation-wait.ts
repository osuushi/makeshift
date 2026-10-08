/** Give a calculation a short grace period before offering explicit cancellation. */
export async function waitForCalculation(
  calculation: Promise<unknown>,
  prompt: () => { choice: Promise<boolean>; dispose: () => void } = calculationWaitDialog,
  delay = 500,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = calculation.then(() => true);
  try {
    const ready = await Promise.race([
      settled,
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), delay);
      }),
    ]);
    if (ready) return true;
    const dialog = prompt();
    let wait: boolean;
    try {
      wait = await Promise.race([settled, dialog.choice]);
    } finally {
      dialog.dispose();
    }
    if (!wait) return false;
    await settled;
    return true;
  } finally {
    clearTimeout(timer);
  }
}

function calculationWaitDialog(): { choice: Promise<boolean>; dispose: () => void } {
  const dialog = document.createElement("dialog");
  dialog.className = "calculation-wait-dialog";
  dialog.setAttribute("aria-label", "Calculation in progress");
  const heading = document.createElement("h2");
  heading.textContent = "Calculation in progress";
  const message = document.createElement("p");
  message.textContent = "Wait for the result, or cancel the current operation and continue?";
  const wait = document.createElement("button"),
    cancel = document.createElement("button");
  wait.textContent = "Wait";
  cancel.textContent = "Cancel operation";
  dialog.append(heading, message, cancel, wait);
  const choice = new Promise<boolean>((resolve) => {
    wait.onclick = () => {
      wait.disabled = cancel.disabled = true;
      message.textContent = "Waiting for the calculation…";
      resolve(true);
    };
    cancel.onclick = () => resolve(false);
    dialog.oncancel = (event) => {
      event.preventDefault();
      resolve(false);
    };
  });
  // The dialog owns Escape and Enter, including capture-phase CAD shortcuts.
  dialog.onkeydown = (event) => event.stopPropagation();
  document.body.append(dialog);
  dialog.showModal();
  wait.focus();
  return {
    choice,
    dispose: () => {
      dialog.close();
      dialog.remove();
    },
  };
}
