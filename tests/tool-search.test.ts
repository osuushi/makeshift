import assert from "node:assert/strict";
import test from "node:test";
import type { ToolResult } from "../src/tools/catalog.js";
import { searchTools } from "../src/tools/search.js";

function tool(id: string, label: string, extra: Partial<ToolResult> = {}): ToolResult {
  return {
    id,
    label,
    category: "Solid",
    unavailable: null,
    reason: () => null,
    run: () => {},
    ...extra,
  };
}
const shell = tool("shell", "Shell", { aliases: ["thickness", "hollow"] });
test("canonical, aliases, prefixes, typos and abbreviations find tools", () => {
  for (const query of ["shell", "thickness", "THÍCKNESS", "thick", "shel", "shll"])
    assert.equal(searchTools([shell], query)[0]?.tool.id, "shell", query);
  assert.equal(searchTools([tool("rectangle", "Rectangle")], "recatngle")[0]?.tool.id, "rectangle");
});
test("sparse ordered subsequences match names, aliases and related terms across words", () => {
  const plane = tool("plane", "Construction plane", { aliases: ["reference plane"] });
  for (const query of ["cstr", "cnpl", "cp", "cstr pl", "rfpl", "CŚTR"])
    assert.equal(searchTools([plane], query)[0]?.tool.id, "plane", query);
  assert.equal(
    searchTools([tool("extrude", "Extrude", { related: ["twist extrusion"] })], "twex")[0]
      ?.explanation,
    "Related: twist extrusion",
  );
  for (const query of ["rcst", "cstr banana", "z", "n"])
    assert.deepEqual(searchTools([plane], query), [], query);
});
test("compact subsequences rank ahead of matches with larger gaps", () => {
  assert.deepEqual(
    searchTools([tool("sparse", "A construction ruler"), tool("compact", "Cstir")], "cstr").map(
      (result) => result.tool.id,
    ),
    ["compact", "sparse"],
  );
});
test("literal prefixes precede word prefixes, anchored fuzzy, internal fuzzy and typos", () => {
  const tools = [
    tool("internal", "Abcstrx"),
    tool("typo", "Csxr"),
    tool("anchored", "Construction plane"),
    tool("word", "X cstr"),
    tool("prefix", "Cstr value"),
  ];
  for (const entries of [tools, [...tools].reverse()])
    assert.deepEqual(
      searchTools(entries, "cstr").map((result) => result.tool.id),
      ["prefix", "word", "anchored", "internal", "typo"],
    );
});
test("word segmentation improves cope over cole for Construction plane", () => {
  const plane = tool("plane", "Construction plane");
  const cope = searchTools([plane], "cope")[0],
    cole = searchTools([plane], "cole")[0];
  assert.equal(cope.tier, cole.tier);
  assert.ok(cope.score < cole.score);
  assert.deepEqual(
    searchTools([tool("flat", "Coralpe"), tool("words", "Coral pe")], "cope").map(
      (result) => result.tool.id,
    ),
    ["words", "flat"],
  );
});
test("scoring considers later alignments instead of greedily taking the first letter", () => {
  assert.deepEqual(
    searchTools([tool("early", "A pbl"), tool("later", "A pb plane")], "apl").map(
      (result) => result.tool.id,
    ),
    ["later", "early"],
  );
});
test("long gaps cannot move anchored fuzzy matches ahead of prefixes or behind internal matches", () => {
  assert.deepEqual(
    searchTools(
      [tool("internal", "Xap"), tool("anchored", `A${"x".repeat(200)}p`), tool("prefix", "Apathy")],
      "ap",
    ).map((result) => result.tool.id),
    ["prefix", "anchored", "internal"],
  );
});
test("availability dominates even an exact disabled name", () => {
  const results = searchTools(
    [
      tool("shell", "Shell", { unavailable: "Select a body" }),
      tool("related", "Offset", { related: ["shell"] }),
    ],
    "shell",
  );
  assert.deepEqual(
    results.map((r) => r.tool.id),
    ["related", "shell"],
  );
});
test("direct tool names rank above exact and prefix aliases", () => {
  const tools = [
    tool("related", "E", { related: ["shell"] }),
    tool("fuzzy", "Shel"),
    tool("prefix", "Shell body"),
    tool("word", "Adjust shell"),
    tool("alias-prefix", "Other", { aliases: ["shell thickness"] }),
    tool("alias", "Hollow", { aliases: ["shell"] }),
    shell,
  ];
  assert.deepEqual(
    searchTools(tools, "shell").map((r) => r.tool.id),
    ["shell", "prefix", "word", "alias", "alias-prefix", "fuzzy", "related"],
  );
});
test("split, plane and section highlight the commands named in the query", () => {
  const split = tool("split", "Split Body");
  const imprint = tool("imprint", "Imprint", { aliases: ["split face", "section face"] });
  const plane = tool("construction-plane", "Construction plane");
  const settings = tool("settings", "Settings", { aliases: ["plane palette"] });
  const section = tool("cross-section", "Cross section", { aliases: ["section view"] });
  const loft = tool("loft", "Loft", { aliases: ["sections"] });
  const tools = [imprint, split, settings, plane, loft, section];
  for (const [query, expected] of [
    ["split", split],
    ["plane", plane],
    ["section", section],
  ] as const) {
    const [first] = searchTools(tools, query);
    assert.equal(first.tool.id, expected.id, query);
    assert.equal(first.explanation, "", query);
  }
  assert.equal(searchTools(tools, "split face")[0]?.tool.id, imprint.id);
});
test("a fuzzy name match ranks above an alias of the same match quality", () => {
  const plane = tool("construction-plane", "Construction plane");
  const duplicate = tool("duplicate", "Duplicate", { aliases: ["copy bodies"] });
  assert.deepEqual(
    searchTools([duplicate, plane], "cope").map((result) => result.tool.id),
    [plane.id, duplicate.id],
  );
});
test("multiword queries require all words; unrelated query stays empty", () => {
  const tools = [tool("offset", "Offset faces"), shell];
  assert.equal(searchTools(tools, "faces off")[0]?.tool.id, "offset");
  assert.deepEqual(searchTools(tools, "offset banana"), []);
  assert.deepEqual(searchTools(tools, "unrecognizable"), []);
});
test("empty queries and ties have stable available-first ordering", () => {
  const tools = [
    tool("z", "Same"),
    tool("a", "Same"),
    tool("disabled", "A", { unavailable: "Not here" }),
  ];
  assert.deepEqual(
    searchTools(tools, "").map((r) => r.tool.id),
    ["a", "z", "disabled"],
  );
  assert.deepEqual(
    searchTools([...tools].reverse(), "").map((r) => r.tool.id),
    ["a", "z", "disabled"],
  );
});
test("all disabled matches are retained without a result cap", () => {
  const tools = Array.from({ length: 75 }, (_, i) =>
    tool(`t${i}`, `Shell ${i}`, { unavailable: "Select geometry" }),
  );
  assert.equal(searchTools(tools, "shell").length, 75);
});
