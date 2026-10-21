import { settled } from "./ui-helpers.mjs";

export async function nameDrawing(page, name) {
  const dialog = page.getByRole("dialog", { name: "Save drawing", exact: true });
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await settled(page);
}

export async function downloadDrawing(page, name) {
  await page.getByRole("button", { name: "File / Edit", exact: true }).click();
  await page.locator('[data-command="download-document"]').click();
  await nameDrawing(page, name);
}
