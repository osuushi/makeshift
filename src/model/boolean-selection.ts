import type { BodyBoolean } from "./body.js";

export type BooleanRole = "target" | "tool" | "input";

export function booleanTargets(operation: BodyBoolean): string[] {
  return operation.targetIds ?? operation.ids.slice(0, 1);
}

export function booleanRole(operation: BodyBoolean, id: string): BooleanRole | undefined {
  if (!operation.ids.includes(id)) return undefined;
  if (operation.mode !== "subtract") return "input";
  return booleanTargets(operation).includes(id) ? "target" : "tool";
}

/** New selections fill the missing role; existing roles never change implicitly. */
export function cycleBooleanBody(operation: BodyBoolean, id: string): BodyBoolean {
  const role = booleanRole(operation, id);
  let ids = [...operation.ids];
  let targetIds = [...booleanTargets(operation)];
  if (!role) {
    ids.push(id);
    if (!targetIds.length) targetIds.push(id);
  } else if (role === "target") {
    targetIds = targetIds.filter((target) => target !== id);
  } else {
    ids = ids.filter((body) => body !== id);
    targetIds = targetIds.filter((target) => target !== id);
  }
  return { ...operation, ids, targetIds };
}

export function flipBooleanRole(operation: BodyBoolean, id: string): BodyBoolean {
  const role = booleanRole(operation, id);
  if (role !== "target" && role !== "tool") return operation;
  const targets = booleanTargets(operation);
  return {
    ...operation,
    targetIds: role === "target" ? targets.filter((target) => target !== id) : [...targets, id],
  };
}

export function booleanRequirement(operation: BodyBoolean): string | null {
  if (operation.mode !== "subtract")
    return operation.ids.length < 2 ? "Select at least two bodies." : null;
  const targets = booleanTargets(operation).filter((id) => operation.ids.includes(id));
  if (!targets.length) return "Select at least one target body to subtract from (+).";
  if (targets.length === operation.ids.length)
    return "Select at least one cutting tool to subtract (−).";
  return null;
}

export function booleanConsumes(operation: BodyBoolean, id: string): boolean {
  return (
    operation.ids.includes(id) &&
    (!operation.keepOriginals ||
      (operation.mode === "subtract" && booleanTargets(operation).includes(id)))
  );
}
