// Hold one real native result at the HTTP delivery boundary; never mock geometry.
export async function holdPreview(page, kind) {
  await page.evaluate(() => {
    window.previewResponseHeld = false;
  });
  let release,
    heldOnce = false;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const intercept = async (route) => {
    if (heldOnce || route.request().postDataJSON()?.kind !== kind) return route.continue();
    heldOnce = true;
    const response = await route.fetch();
    await page.evaluate(() => {
      window.previewResponseHeld = true;
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
