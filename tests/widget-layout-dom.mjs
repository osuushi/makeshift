import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium, webkit } from "playwright";
import { runtimeNames } from "./ui-runtime.mjs";
import { cardFootprintDom } from "./widget-card-footprint-dom.mjs";
import { frozenLayoutDom } from "./widget-frozen-layout-dom.mjs";
import { planarLayoutDom } from "./widget-planar-layout-dom.mjs";
import { pressedCardDom } from "./widget-pressed-card-dom.mjs";
import { sweptLayoutDom } from "./widget-swept-layout-dom.mjs";

// A blank DOM exercises the actual placement class without booting a document,
// Electron host, solver or CAD kernel.
const server = createServer(async (request, response) => {
  const modules = {
    "/widget-clearance.js": "model/widget-clearance.js",
    "/widget-freeze.js": "model/widget-freeze.js",
    "/widget-viewport.js": "model/widget-viewport.js",
    "/preferences/panel-placement.js": "preferences/panel-placement.js",
    "/model/widget-viewport.js": "model/widget-viewport.js",
    "/sketch/sketch-widget-layout.js": "sketch/sketch-widget-layout.js",
  };
  if (request.url === "/panel-placement.css") {
    response.setHeader("Content-Type", "text/css");
    response.end(await readFile("src/preferences/panel-placement.css"));
  } else if (modules[request.url]) {
    response.setHeader("Content-Type", "text/javascript");
    response.end(await readFile(`.cache/sketch-tests/src/${modules[request.url]}`));
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end(`<link rel="stylesheet" href="/panel-placement.css"><style>
      *{box-sizing:border-box}body{margin:0}canvas{width:1000px;height:700px}
      #root{position:absolute;inset:0;pointer-events:none}
      #options{position:absolute;left:1200px;top:800px;width:240px;height:36px;
        transform:translateX(-30%);display:flex;pointer-events:auto;background:white}
      button{width:36px;height:36px} .extrude-targets{position:absolute;left:0;top:42px;
        width:300px;height:70px;white-space:nowrap;background:white;pointer-events:auto}
      header{position:absolute;left:10px;top:10px;width:600px;height:45px}
    </style><canvas></canvas><header></header><div id="root"><div id="options">
      <button>Axis</button><button>Accept</button>
      <div class="extrude-targets"><button>Body1</button><button>Body2</button></div>
    </div></div>`);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  for (const name of runtimeNames(["chromium", "webkit"])) {
    const runtime = { chromium, webkit }[name];
    const browser = await runtime.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1000, height: 700 },
        reducedMotion: "reduce",
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const result = await page.evaluate(async () => {
        const { WidgetClearance } = await import("/widget-clearance.js");
        const root = document.querySelector("#root"),
          options = document.querySelector("#options");
        const chooser = options.querySelector(".extrude-targets");
        const placement = new WidgetClearance(root);
        placement.fit([options]);
        const bounds = (element) => {
          const r = element.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        };
        const hit = [...options.querySelectorAll("button")].every((button) => {
          const r = button.getBoundingClientRect();
          return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        });
        const first = {
          options: bounds(options),
          chooser: bounds(chooser),
          hit,
          parent: getComputedStyle(options).translate,
          child: getComputedStyle(chooser).translate,
          overflow: getComputedStyle(options).overflow,
          fit: options.dataset.widgetFit,
        };
        placement.fit([options]);
        const second = bounds(chooser);
        options
          .querySelector("button")
          .dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
        options.style.left = "1100px";
        placement.fit([options]);
        const frozen = getComputedStyle(options).translate;
        placement.dispose();
        return {
          first,
          second,
          frozen,
          guides: root.querySelectorAll(".widget-docking-guide").length,
        };
      });
      const { first } = result;
      assert.equal(first.fit, "clear");
      for (const rect of [first.options, first.chooser]) {
        assert.ok(
          rect.x >= 8 && rect.y >= 8 && rect.right <= 992 && rect.bottom <= 692,
          `${name}: post-correction rectangle ${JSON.stringify(rect)}`,
        );
      }
      assert.equal(first.hit, true, `${name}: chooser and main actions remain hittable`);
      assert.notEqual(first.parent, "none");
      assert.equal(first.child, "none", "Only the group owner receives correction");
      assert.equal(first.overflow, "visible", "Normal card does not clip its absolute chooser");
      assert.deepEqual(result.second, first.chooser, "Repeated fit remains stable");
      const frozen = result.frozen.split(" ").map(Number.parseFloat);
      const original = first.parent.split(" ").map(Number.parseFloat);
      assert.ok(
        frozen.every((value, i) => Math.abs(value - original[i]) < 1e-4),
        "Hover retains the displayed correction within CSS subpixel rounding",
      );
      assert.equal(result.guides, 0);
      const narrow = await page.evaluate(async () => {
        const { WidgetClearance } = await import("/widget-clearance.js");
        const canvas = document.querySelector("canvas");
        canvas.style.width = "320px";
        canvas.style.height = "240px";
        document.querySelector("header").style.width = "300px";
        const entities = document.createElement("aside");
        entities.className = "entity-viewer";
        entities.style.cssText = "position:absolute;left:8px;top:65px;width:190px;height:150px";
        document.body.append(entities);
        const root = document.querySelector("#root"),
          options = document.querySelector("#options");
        const placement = new WidgetClearance(root);
        placement.fit([options]);
        const rect = options.getBoundingClientRect();
        const hits = [...options.querySelectorAll("button")].every((button) => {
          const r = button.getBoundingClientRect();
          return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        });
        const state = {
          x: rect.x,
          y: rect.y,
          right: rect.right,
          bottom: rect.bottom,
          overflow: getComputedStyle(options).overflow,
          scrollWidth: options.scrollWidth,
          clientWidth: options.clientWidth,
          hits,
          fit: options.dataset.widgetFit,
        };
        placement.dispose();
        return state;
      });
      assert.equal(narrow.fit, "clear");
      assert.ok(narrow.x >= 204 && narrow.y >= 8 && narrow.right <= 312 && narrow.bottom <= 232);
      assert.equal(narrow.overflow, "auto");
      assert.ok(
        narrow.scrollWidth > narrow.clientWidth,
        "Narrow card keeps chooser accessible by scrolling",
      );
      assert.equal(
        narrow.hits,
        true,
        "Primary actions and the first chooser actions remain hittable",
      );
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const toolsObstacle = await page.evaluate(async () => {
        const header = document.querySelector("header");
        header.style.width = "100px";
        header.style.zIndex = "2";
        const tools = document.createElement("button");
        tools.textContent = "Tools";
        tools.className = "tools-trigger";
        tools.style.cssText =
          "position:absolute;left:160px;top:10px;width:100px;height:40px;z-index:2";
        document.body.append(tools);
        const root = document.querySelector("#root");
        root.querySelector("#options").remove();
        const handle = document.createElement("button");
        handle.style.cssText = "position:absolute;left:160px;top:10px;pointer-events:auto";
        root.append(handle);
        const { WidgetClearance } = await import("/widget-clearance.js");
        const placement = new WidgetClearance(root);
        placement.fit([handle]);
        const rect = handle.getBoundingClientRect();
        const hittable = handle.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
        const result = { hittable, fit: handle.dataset.widgetFit };
        placement.dispose();
        return result;
      });
      assert.deepEqual(toolsObstacle, { hittable: true, fit: "clear" });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await cardFootprintDom(page, name);
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await frozenLayoutDom(page, name);
      await pressedCardDom(page, name);
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await sweptLayoutDom(page, name);
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await planarLayoutDom(page, name);
      console.log(
        `${name}: measured group docking, nested chooser hits, repeated layout and hover freeze passed`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
