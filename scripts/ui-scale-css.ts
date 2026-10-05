import { resolve } from "node:path";
import type { Plugin } from "postcss";
import valueParser from "postcss-value-parser";

/** Authored interface lengths scale; breakpoints and inline geometry positions do not. */
export function uiScaleCss(): Plugin {
  const root = `${resolve("src").replaceAll("\\", "/")}/`;
  return {
    postcssPlugin: "makeshift-ui-scale",
    Declaration(declaration) {
      const file = declaration.source?.input.file?.replaceAll("\\", "/");
      if (!file?.startsWith(root) || !file.endsWith(".css")) return;
      if (declaration.value.includes("--ui-scale") || declaration.prop === "content") return;
      // Fixed SVG viewBox units already scale through their viewport dimensions.
      if (
        declaration.prev()?.type === "comment" &&
        declaration.prev()?.toString().includes("ui-scale: viewbox")
      )
        return;
      const value = valueParser(declaration.value);
      value.walk((node) => {
        if (node.type === "function" && node.value.toLowerCase() === "url") return false;
        if (node.type !== "word") return;
        const dimension = valueParser.unit(node.value);
        if (!dimension) return;
        if (dimension.unit.toLowerCase() !== "px" || !Number(dimension.number)) return;
        node.value = `calc(${dimension.number}px * var(--ui-scale, 1))`;
      });
      declaration.value = value.toString();
    },
  };
}
