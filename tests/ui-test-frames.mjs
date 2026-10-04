const installed = new WeakSet();

/** Explicit CI mode: retain real input/model updates, render fresh pixels for captures. */
export async function installTestFrames(page) {
  if (process.env.MAKESHIFT_TEST_FRAME_MODE !== "on-demand" || installed.has(page)) return;
  installed.add(page);
  const enable = () => {
    window.makeshiftTestFrameMode = "on-demand";
  };
  await page.addInitScript(enable);
  await page.evaluate(enable);
  const screenshot = page.screenshot.bind(page);
  page.screenshot = async (...args) => {
    await captureTestFrame(page);
    return screenshot(...args);
  };
}

export async function captureTestFrame(page) {
  if (!installed.has(page)) return;
  await page.evaluate(async () => {
    // Let pending interaction updates settle, then present the current scene.
    await new Promise(requestAnimationFrame);
    window.dispatchEvent(new Event("makeshift-test-frame"));
    await new Promise(requestAnimationFrame);
  });
}
