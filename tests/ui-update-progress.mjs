import assert from "node:assert/strict";

/** The actual Electron status window must apply its CSP-safe animation and media queries. */
export async function updateProgressRoute(page) {
  const progress = page.getByRole("progressbar", { name: "Update in progress" });
  assert.equal(await progress.getAttribute("aria-valuenow"), null, "Indeterminate progress");
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "no-preference" });
    const frames = await progress.evaluate(async (track) => {
      const animations = document.getAnimations();
      await Promise.all(animations.map((animation) => animation.ready));
      for (const animation of animations) animation.pause();
      const bounds = track.getBoundingClientRect();
      const bar = track.querySelector(".update-bar");
      return Array.from({ length: 101 }, (_, percent) => {
        for (const animation of animations) animation.currentTime = 14 * percent;
        const rect = bar.getBoundingClientRect();
        return {
          left: rect.left - bounds.left,
          right: rect.right - bounds.left,
          width: bounds.width,
        };
      });
    });
    for (const [percent, frame] of frames.entries()) {
      assert.ok(
        frame.left >= -0.1 && frame.right <= frame.width + 0.1,
        `${colorScheme}: bounds at ${percent}%`,
      );
      if (percent >= 43 && percent <= 64)
        assert.ok(
          Math.abs(frame.right - frame.width) < 0.1,
          `${colorScheme}: right contact at ${percent}%`,
        );
      if (percent <= 14 || percent >= 93)
        assert.ok(Math.abs(frame.left) < 0.1, `${colorScheme}: left contact at ${percent}%`);
    }
    assert.deepEqual(frames[0], frames[14], "Left rest stays stationary");
    assert.deepEqual(frames[50], frames[64], "Right rest stays stationary");
    assert.ok(
      frames[31].right - frames[31].left > frames[23].right - frames[23].left,
      "Launch stretches",
    );
    assert.ok(frames[42].right < frames[43].right - 1, "Travel retains speed into contact");
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    assert.equal(
      await page.evaluate(() => document.getAnimations().length),
      0,
      "Reduced motion is static",
    );
  }
  await page.emulateMedia({ colorScheme: null, reducedMotion: "no-preference" });
}
