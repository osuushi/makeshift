/** Enter through the ordinary tool menu, then change method while its first preview runs. */
export async function accurateErosion(page) {
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("combobox", { name: "Find a tool" }).fill("erode");
  await page.locator('[data-command="erode"]').click();
  await page
    .getByRole("combobox", { name: "Erosion method", exact: true })
    .selectOption("accurate");
  await page.waitForFunction(() => !window.makeshiftInspect().busy);
}
