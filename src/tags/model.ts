import { validName } from "../security/text.js";
import { newId, type SketchDocument } from "../sketch/document.js";

export interface TagMember {
  readonly kind: "face" | "edge";
  readonly id: string;
}
export type TagProblem = "lost" | "expanded" | "inferred" | "split";
export interface TaggedGroup {
  readonly id: string;
  readonly body: string;
  readonly name: string;
  readonly description?: string;
  readonly members: readonly TagMember[];
  readonly problems: readonly TagProblem[];
  /** Informational split origin; not an executable dependency. */
  readonly splitFrom?: string;
}
export type TagEdit =
  | {
      action: "create";
      body: string;
      name: string;
      description?: string;
      members: readonly TagMember[];
    }
  | {
      action: "update";
      id: string;
      name?: string;
      description?: string;
      members?: readonly TagMember[];
    }
  | { action: "remove"; id: string };
export const tagProblemLabels: Record<TagProblem, string> = {
  lost: "Some geometry was removed",
  expanded: "Membership expanded by a merge",
  inferred: "Includes inferred matches",
  split: "Group split across bodies",
};
export function tagStatus(group: TaggedGroup): string {
  return group.members.length
    ? group.problems.map((p) => tagProblemLabels[p]).join(" · ")
    : "Missing geometry";
}
export function requireTag(document: SketchDocument, id: string): TaggedGroup {
  const group = document.taggedGroups?.find((g) => g.id === id);
  if (!group)
    throw new Error("Unknown tagged group. Inspect current groups; the owner may have split.");
  return group;
}
export function validateTags(document: SketchDocument): void {
  if (document.taggedGroups === undefined) return;
  if (!Array.isArray(document.taggedGroups)) throw new Error("Invalid tagged groups");
  for (const g of document.taggedGroups) {
    const body = document.bodies?.find((b) => b.id === g?.body);
    if (
      !g ||
      !body ||
      !validName(g.name) ||
      (g.description !== undefined &&
        (typeof g.description !== "string" || g.description.length > 2000)) ||
      (g.splitFrom !== undefined && (typeof g.splitFrom !== "string" || !g.splitFrom)) ||
      !Array.isArray(g.members) ||
      !Array.isArray(g.problems) ||
      g.problems.some(
        (p: unknown) => typeof p !== "string" || !Object.hasOwn(tagProblemLabels, p),
      ) ||
      new Set(g.members.map((m: TagMember) => m?.id)).size !== g.members.length
    )
      throw new Error("Invalid tagged group");
    for (const member of g.members) {
      if (
        !member ||
        !["face", "edge"].includes(member.kind) ||
        !(member.kind === "face" ? body.faces : body.edges).some((m) => m.id === member.id)
      )
        throw new Error("Tagged members must be current faces or edges in one body");
    }
  }
}
export function editTags(document: SketchDocument, edit: TagEdit): SketchDocument {
  if (!edit || !["create", "update", "remove"].includes(edit.action))
    throw new Error("Invalid tag edit");
  const groups = document.taggedGroups ?? [];
  const previous = edit.action === "create" ? null : requireTag(document, edit.id);
  let next: readonly TaggedGroup[];
  if (edit.action === "remove") next = groups.filter((g) => g.id !== edit.id);
  else if (edit.action === "create") {
    if (!Array.isArray(edit.members) || !edit.members.length)
      throw new Error("Select faces or edges to tag");
    next = [
      ...groups,
      {
        id: newId(),
        body: edit.body,
        name: edit.name,
        ...(edit.description !== undefined ? { description: edit.description } : {}),
        members: edit.members,
        problems: [],
      },
    ];
  } else {
    if (!previous) throw new Error("Unknown tagged group");
    const updated = {
      ...previous,
      ...(edit.name !== undefined ? { name: edit.name } : {}),
      ...(edit.description !== undefined ? { description: edit.description } : {}),
      ...(edit.members !== undefined ? { members: edit.members, problems: [] } : {}),
    };
    next = groups.map((g) => (g.id === edit.id ? updated : g));
  }
  const candidate = { ...document, taggedGroups: next };
  validateTags(candidate);
  return candidate;
}
