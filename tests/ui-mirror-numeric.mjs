import assert from "node:assert/strict";
import { resolve } from "node:path";
import { inspect } from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";

/** Parser tests cannot catch a stale Three.js reference while acceptance rejects the draft.
 * Observe that scene decoration; geometry still enters through ordinary inputs. */
export async function mirrorNumericDraft(page, original) {
  await page.evaluate(
    async (url) => {
      const { MirrorReferenceView } = await import(url);
      const show = MirrorReferenceView.prototype.show;
      window.mirrorReferenceProbe = {
        children: -1,
        restore: () => {
          MirrorReferenceView.prototype.show = show;
        },
      };
      MirrorReferenceView.prototype.show = function (reference) {
        show.call(this, reference);
        if (!Reflect.get(this, "hover"))
          window.mirrorReferenceProbe.children = Reflect.get(this, "group").children.length;
      };
    },
    `/@fs${resolve("src/model/mirror-reference-view.ts")}`,
  );
  const input = page.getByRole("textbox", { name: "Mirror offset" });
  const accept = page.getByRole("button", { name: "Accept mirror", exact: true });
  try {
    for (const draft of ["", "-", "1e", "Infinity"]) {
      await input.fill(draft);
      await inspect(page);
      assert.equal(await input.inputValue(), draft);
      assert.equal(await input.evaluate((element) => document.activeElement === element), true);
      assert.equal(await accept.isEnabled(), false);
      assert.equal(await page.evaluate(() => window.mirrorReferenceProbe.children), 0);
      await input.press("Enter");
      const state = await inspect(page);
      assert.deepEqual(state.document, original);
      assert.ok(state.interaction, "Invalid Enter retains the editing interaction");
    }
    await input.fill("0");
    await previewActionReady(page, "Accept mirror");
    assert.ok(await page.evaluate(() => window.mirrorReferenceProbe.children > 0));
    assert.ok((await inspect(page)).preview);
  } finally {
    await page.evaluate(() => {
      window.mirrorReferenceProbe.restore();
      delete window.mirrorReferenceProbe;
    });
  }
}
