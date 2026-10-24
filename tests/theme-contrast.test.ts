import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";
import { terminalPalettes } from "../src/agent/terminal-theme.js";
import { viewportPalettes } from "../src/preferences/viewport-theme.js";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a: string, b: string): number {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function check(fg: string, bg: string, minimum: number, name: string): void {
  const ratio = contrast(fg, bg);
  assert.ok(ratio >= minimum, `${name}: ${ratio.toFixed(2)} < ${minimum}`);
}

test("interface text, status, focus and control borders have AA contrast in both themes", () => {
  const ast = postcss.parse(readFileSync("src/preferences/theme.css", "utf8"));
  const base: Record<string, string> = {};
  const dark: Record<string, string> = {};
  ast.walkRules((rule) => {
    if (rule.selector === ":root" || rule.selector === ':root[data-theme="dark"]')
      rule.walkDecls((decl) => {
        (rule.selector === ":root" ? base : dark)[decl.prop] = decl.value;
      });
  });
  for (const [name, palette] of [
    ["light", base],
    ["dark", { ...base, ...dark }],
  ] as const) {
    for (const bg of ["canvas", "panel", "surface", "selected", "warning-surface"]) {
      for (const fg of [
        "text",
        "muted",
        "accent",
        "warning",
        "danger",
        "success",
        "purple",
        "teal",
      ])
        check(palette[`--${fg}`], palette[`--${bg}`], 4.5, `${name} ${fg}/${bg}`);
      check(palette["--border"], palette[`--${bg}`], 3, `${name} border/${bg}`);
    }
    check(palette["--on-accent"], palette["--accent"], 4.5, `${name} primary button`);
  }
});

test("sketch ink and terminal ANSI colors have contrast against their canvases", () => {
  for (const [name, palette] of Object.entries(viewportPalettes)) {
    for (const [role, color] of Object.entries(palette))
      if (role !== "background") check(color, palette.background, 3, `${name} viewport ${role}`);
  }
  for (const [name, palette] of Object.entries(terminalPalettes)) {
    for (const [role, color] of Object.entries(palette))
      if (!["background", "cursorAccent", "selectionBackground"].includes(role))
        check(color, palette.background, 4.5, `${name} terminal ${role}`);
    check(
      palette.selectionForeground,
      palette.selectionBackground,
      4.5,
      `${name} terminal selection`,
    );
  }
});

test("application styles use audited tokens instead of new hard-coded colors", () => {
  for (const path of readdirSync("src", { recursive: true }) as string[]) {
    if (!path.endsWith(".css") || path === "preferences/theme.css") continue;
    postcss.parse(readFileSync(`src/${path}`, "utf8")).walkDecls((decl) => {
      // Masks encode coverage, not visible colors.
      if (decl.prop.includes("mask")) return;
      assert.doesNotMatch(
        decl.value,
        /#[\da-f]{3,8}\b|\brgba?\(|\b(?:white|black)\b/i,
        `${path}: ${decl.prop}`,
      );
    });
  }
});
