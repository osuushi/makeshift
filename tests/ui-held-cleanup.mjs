export async function holdCleanup(page) {
  await page.evaluate(() => {
    window.previewCleanupHeld = false;
  });
  let release,
    heldOnce = false;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const intercept = async (route) => {
    if (heldOnce || route.request().postDataJSON()?.kind !== "check-cleanup")
      return route.continue();
    heldOnce = true;
    const response = await route.fetch();
    await page.evaluate(() => {
      window.previewCleanupHeld = true;
    });
    await held;
    await route.fulfill({ response });
  };
  await page.route("**/sketch-api", intercept);
  return {
    release,
    close: async () => {
      release();
      await page.unroute("**/sketch-api", intercept);
    },
  };
}
