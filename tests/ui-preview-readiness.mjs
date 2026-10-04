/** Wait for background preview checks before sending a physical Accept click. */
export async function previewActionReady(page, label) {
  await page.waitForFunction((label) => {
    const state = window.makeshiftInspect();
    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.getAttribute("aria-label") === label,
    );
    const pending = [...document.querySelectorAll(".commit-cleanup")].some(
      (candidate) =>
        candidate.getClientRects().length && candidate.getAttribute("aria-busy") === "true",
    );
    return !state.busy && !pending && button?.getClientRects().length && !button.disabled;
  }, label);
}
