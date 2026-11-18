import type { ToolResult } from "./catalog.js";
import { matchQuality } from "./search-quality.js";

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export interface SearchResult {
  tool: ToolResult;
  tier: number;
  score: number;
  explanation: string;
}

// Match-quality order: literal prefix, word prefixes, anchored fuzzy, internal fuzzy, typo.
// Exact names use tier 0 and exact aliases use tier 3. Within each fuzzy
// quality, a name match takes precedence over an alias match.
const nameTiers = [1, 2, 6, 8, 10];
const aliasTiers = [4, 5, 7, 9, 11];

function match(tool: ToolResult, query: string): SearchResult | null {
  if (!query) return { tool, tier: 0, score: 0, explanation: "" };
  const name = normalize(tool.label);
  if (name === query) return { tool, tier: 0, score: 0, explanation: "" };
  const candidates = [
    { value: tool.label, source: "name" as const },
    ...(tool.aliases ?? []).map((value) => ({ value, source: "alias" as const })),
    ...(tool.related ?? []).map((value) => ({ value, source: "related" as const })),
  ];
  const matches = candidates.flatMap(({ value, source }) => {
    const normalized = normalize(value),
      q = matchQuality(query, normalized);
    if (q === null) return [];
    let tier = nameTiers[q.tier];
    let explanation = "";
    if (source === "alias") {
      tier = normalized === query ? 3 : aliasTiers[q.tier];
      explanation = `Also called ${value}`;
    } else if (source === "related") {
      tier = 12 + q.tier;
      explanation = `Related: ${value}`;
    }
    return [
      {
        tool,
        tier,
        score: q.score,
        explanation,
      },
    ];
  });
  return matches.sort((a, b) => a.tier - b.tier || a.score - b.score)[0] ?? null;
}
export function searchTools(tools: readonly ToolResult[], query: string): SearchResult[] {
  const normalized = normalize(query);
  return tools
    .flatMap((tool) => {
      const result = match(tool, normalized);
      return result ? [result] : [];
    })
    .sort(
      (a, b) =>
        Number(!!a.tool.unavailable) - Number(!!b.tool.unavailable) ||
        a.tier - b.tier ||
        a.score - b.score ||
        a.tool.label.localeCompare(b.tool.label) ||
        a.tool.id.localeCompare(b.tool.id),
    );
}
