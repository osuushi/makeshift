import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import postcss from "postcss";
import { uiScaleCss } from "../scripts/ui-scale-css.ts";

test("interface lengths scale without touching viewport queries, strings or inline positions", async () => {
  const input = `@media(max-width:700px){.menu{width:min(560px,100%);top:calc(100% + 6px);font:14px sans-serif;--radius:14px;background:url("icon-24px.svg");content:"14px";transform:translate(-16px,0px)}} .cube{/* ui-scale: viewbox */font-size:10px}`;
  const output = (await postcss([uiScaleCss()]).process(input, { from: resolve("src/menu.css") }))
    .css;
  assert.ok(output.includes("max-width:700px"));
  assert.ok(output.includes("min(calc(560px * var(--ui-scale, 1)),100%)"));
  assert.ok(output.includes("calc(100% + calc(6px * var(--ui-scale, 1)))"));
  assert.ok(output.includes("font:calc(14px * var(--ui-scale, 1)) sans-serif"));
  assert.ok(output.includes("--radius:calc(14px * var(--ui-scale, 1))"));
  assert.ok(output.includes('url("icon-24px.svg")'));
  assert.ok(output.includes('content:"14px"'));
  assert.ok(output.includes("translate(calc(-16px * var(--ui-scale, 1)),0px)"));
  assert.ok(output.includes("font-size:10px"));
  assert.equal(
    (
      await postcss([uiScaleCss()]).process(input, {
        from: resolve("node_modules/vendor/src/styles.css"),
      })
    ).css,
    input,
  );
});
