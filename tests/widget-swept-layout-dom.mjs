import assert from "node:assert/strict";

export async function sweptLayoutDom(page, name) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const result = await page.evaluate(async () => {
    const { WidgetClearance } = await import("/widget-clearance.js"),
      { measuredControlRect, rectsOverlap, widgetViewport } = await import("/widget-viewport.js");
    const root = document.querySelector("#root");
    root.innerHTML = `<button class="body-axis-handle" style="position:absolute;left:-100px;top:400px;width:30px;height:30px;transform:translate(-50%,-50%);pointer-events:auto">B<svg style="position:absolute;left:-9px;top:-9px;width:48px;height:48px;pointer-events:none"><circle cx="24" cy="24" r="24" fill="white"/></svg></button>`;
    const scaleRoot = document.createElement("div");
    scaleRoot.className = "scale-widget";
    scaleRoot.style.cssText = "position:absolute;inset:0;pointer-events:none";
    scaleRoot.innerHTML = `<button hidden style="position:absolute;left:400px;top:400px;width:18px;height:18px;transform:translate(-50%,-50%);pointer-events:auto">S</button>`;
    document.body.append(scaleRoot);
    const body = root.querySelector("button"),
      knob = scaleRoot.querySelector("button"),
      bodyPlacement = new WidgetClearance(root),
      scalePlacement = new WidgetClearance(scaleRoot);
    bodyPlacement.fit([body]);
    getComputedStyle(body).translate;
    body.style.left = "400px";
    bodyPlacement.fit([body]);
    const moving = getComputedStyle(body).translate !== body.style.translate;
    knob.hidden = false;
    scalePlacement.fit([knob]);
    const frames = [];
    for (let i = 0; i < 20; i++) {
      await new Promise(requestAnimationFrame);
      const hit = [body, knob].every((control) => {
        const r = control.getBoundingClientRect();
        return control.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
      frames.push({
        hit,
        separated: !rectsOverlap(measuredControlRect(body), measuredControlRect(knob)),
      });
    }
    const stationary = [];
    for (const translation of ["none", "20px"]) {
      body.style.transition = "none";
      body.style.translate = translation;
      const rect = measuredControlRect(body);
      stationary.push({ rect, obstacle: widgetViewport(scaleRoot).obstacles.at(-1) });
    }
    bodyPlacement.fit([body]);
    body.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    const captured = getComputedStyle(body).translate;
    body.style.left = "450px";
    bodyPlacement.fit([body]);
    const held = {
      captured,
      correction: getComputedStyle(body).translate,
      rect: measuredControlRect(body),
      obstacle: widgetViewport(scaleRoot).obstacles.at(-1),
    };
    window.dispatchEvent(new PointerEvent("pointercancel"));
    bodyPlacement.dispose();
    scalePlacement.dispose();
    scaleRoot.remove();
    return { moving, frames, stationary, held };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(result.moving, true, "Regression includes a real CSS correction animation");
  for (const frame of result.frames)
    assert.equal(
      frame.hit && frame.separated,
      true,
      `${name}: swept body priority ${JSON.stringify(frame)}`,
    );
  for (const { rect, obstacle } of [...result.stationary, result.held]) {
    assert.equal(rect.width, 48, "The measured obstacle includes the glyph silhouette");
    assert.deepEqual(
      obstacle,
      rect,
      "Stationary or frozen corrections reserve only their current footprint",
    );
  }
  assert.equal(result.held.correction, result.held.captured, "Pressed correction stays exact");
}
