import assert from "node:assert/strict";

async function setupFrozen(page) {
  await page.evaluate(async () => {
    const { WidgetClearance } = await import("/widget-clearance.js");
    const root = document.querySelector("#root");
    root.innerHTML = `<button id="knob" style="position:absolute;left:-100px;top:350px;width:18px;height:18px;transform:translate(-50%,-50%);pointer-events:auto">K</button><div id="card" hidden style="position:absolute;left:10px;top:341px;width:150px;height:140px;pointer-events:auto;background:white"><input aria-label="Size" style="width:70px"><button>Accept</button><button>Cancel</button></div>`;
    const knob = root.querySelector("#knob"),
      card = root.querySelector("#card");
    const second = knob.cloneNode(true),
      third = knob.cloneNode(true);
    second.id = "second";
    third.id = "third";
    second.style.left = "190px";
    third.style.left = "200px";
    third.style.top = "530px";
    root.append(second, third);
    const placement = new WidgetClearance(root),
      controls = [knob, second, third, card];
    placement.fit(controls);
    knob.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    knob.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    window.frozenFixture = {
      root,
      knob,
      card,
      placement,
      controls,
      captured: getComputedStyle(knob).translate,
    };
    card.hidden = false;
    placement.fit(controls);
  });
}

async function frozenFrames(page, picked, stage) {
  return page.evaluate(
    async ({ picked, stage }) => {
      const { root, controls } = window.frozenFixture,
        frames = [];
      for (let i = 0; i < 10; i++) {
        await new Promise(requestAnimationFrame);
        const rects = controls.map((element) => element.getBoundingClientRect());
        const hit = [...root.querySelectorAll("button,input")].every((control) => {
          const r = control.getBoundingClientRect();
          return control.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        });
        const separated = rects.every((r, i) =>
          rects
            .slice(i + 1)
            .every(
              (s) =>
                r.right + 5.99 <= s.left ||
                s.right + 5.99 <= r.left ||
                r.bottom + 5.99 <= s.top ||
                s.bottom + 5.99 <= r.top,
            ),
        );
        frames.push({
          stage,
          hit,
          separated,
          correction: getComputedStyle(root.querySelector(`#${picked}`)).translate,
          fits: controls.map((c) => c.dataset.widgetFit),
        });
      }
      return frames;
    },
    { picked, stage },
  );
}

async function assertFrozen(page, name, picked, captured, stage) {
  for (const frame of await frozenFrames(page, picked, stage)) {
    assert.equal(
      frame.hit && frame.separated,
      true,
      `${name}: current frozen footprints ${JSON.stringify(frame)}`,
    );
    assert.equal(frame.correction, captured, "Picked CSS correction stays exact");
    assert.deepEqual(frame.fits, ["clear", "clear", "clear", "clear"]);
  }
}

export async function frozenLayoutDom(page, name) {
  await setupFrozen(page);
  const captured = await page.evaluate(() => window.frozenFixture.captured);
  for (const stage of ["held", "released", "left"]) {
    await page.evaluate((stage) => {
      const { root } = window.frozenFixture;
      if (stage === "released") window.dispatchEvent(new PointerEvent("pointerup"));
      if (stage === "left")
        root.dispatchEvent(
          new PointerEvent("pointerout", { relatedTarget: document.querySelector("canvas") }),
        );
    }, stage);
    await assertFrozen(page, name, "knob", captured, stage);
  }
  await page.evaluate(() => {
    const { knob, card, placement, controls } = window.frozenFixture;
    knob.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    card.style.width = "240px";
    placement.fit(controls);
  });
  await assertFrozen(page, name, "knob", captured, "unpicked card grew");
  const cardCorrection = await page.evaluate(() => {
    const { root, knob, card, placement, controls } = window.frozenFixture;
    card.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    card.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    const captured = getComputedStyle(card).translate;
    root.dispatchEvent(
      new PointerEvent("pointerout", { relatedTarget: document.querySelector("canvas") }),
    );
    knob.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    card.style.height = "220px";
    placement.fit(controls);
    return captured;
  });
  await assertFrozen(page, name, "card", cardCorrection, "picked card grew");
  await page.evaluate(() => {
    const { root, card, placement, controls } = window.frozenFixture;
    card.style.height = "140px";
    placement.fit(controls);
    window.dispatchEvent(new PointerEvent("pointerup"));
    root.dispatchEvent(
      new PointerEvent("pointerout", { relatedTarget: document.querySelector("canvas") }),
    );
  });
  await assertFrozen(page, name, "card", cardCorrection, "shrunk and resumed");
  await page.evaluate(() => window.frozenFixture.placement.dispose());
  await idleHoverDom(page, name);
}

async function trackIdleHover(page) {
  return page.evaluate(async () => {
    const { WidgetClearance } = await import("/widget-clearance.js"),
      { measuredControlRect, widgetRectClear, widgetViewport } = await import(
        "/widget-viewport.js"
      );
    const root = document.querySelector("#root");
    root.innerHTML = `<button id="tracked" style="position:absolute;left:240px;top:320px;width:18px;height:18px;transform:translate(-50%,-50%);pointer-events:auto">K</button>`;
    const entities = document.createElement("aside");
    entities.className = "entity-viewer";
    entities.style.cssText =
      "position:absolute;left:20px;top:85px;width:190px;height:211px;background:white";
    document.body.append(entities);
    const knob = root.querySelector("#tracked"),
      placement = new WidgetClearance(root);
    const state = () => {
      const rect = measuredControlRect(knob),
        { obstacles, viewport } = widgetViewport(root);
      return {
        correction: getComputedStyle(knob).translate,
        safe: widgetRectClear(rect, obstacles, viewport),
        hit: knob.contains(document.elementFromPoint(rect.x, rect.y)),
        fit: knob.dataset.widgetFit,
      };
    };
    placement.fit([knob]);
    knob.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    knob.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    const captured = state().correction;
    // Model tracking during a held gesture enters only the chrome's corner:
    // its center remains hittable, so center-hit checks alone cannot catch this.
    knob.style.left = "213px";
    knob.style.top = "299px";
    placement.fit([knob]);
    const pressed = state();
    root.dispatchEvent(
      new PointerEvent("pointerout", { relatedTarget: document.querySelector("canvas") }),
    );
    placement.fit([knob]);
    const pressedLeft = state();
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 213, clientY: 299 }));
    placement.fit([knob]);
    const released = state();
    const stable = [];
    for (let i = 0; i < 10; i++) {
      await new Promise(requestAnimationFrame);
      stable.push(state());
    }
    // Ordinary nominal tracking remains immediate without moving a safe hover's
    // collision correction, or requiring the pointer to leave the target.
    knob.style.left = "216px";
    placement.fit([knob]);
    const safeHover = state();
    placement.dispose();
    entities.remove();
    return { captured, pressed, pressedLeft, released, stable, safeHover };
  });
}

async function idleHoverDom(page, name) {
  const result = await trackIdleHover(page);
  for (const state of [result.pressed, result.pressedLeft]) {
    assert.equal(state.correction, result.captured, `${name}: pressed offset is exact`);
    assert.equal(state.safe, false, "Regression reproduces a genuine chrome corner conflict");
    assert.equal(state.hit, true, "The center remains hittable despite partial chrome overlap");
    assert.equal(state.fit, "limited");
  }
  assert.notEqual(
    result.released.correction,
    result.captured,
    "Unsafe idle hover fits immediately",
  );
  for (const state of [result.released, ...result.stable, result.safeHover]) {
    assert.equal(
      state.safe && state.hit,
      true,
      `${name}: safe idle footprint ${JSON.stringify(state)}`,
    );
    assert.equal(state.fit, "clear");
    assert.equal(
      state.correction,
      result.released.correction,
      "Safe hover correction remains stable",
    );
  }
}
