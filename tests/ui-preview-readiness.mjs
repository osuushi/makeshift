/** Wait for background preview checks before sending a physical Accept click. */
export async function previewActionReady(page, label) {
  await page.waitForFunction((label) => {
    const state = window.makeshiftInspect();
    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.getAttribute("aria-label") === label,
    );
    return !state.busy && button?.getClientRects().length && !button.disabled;
  }, label);
}
