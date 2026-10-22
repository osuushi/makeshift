import type { DecoratorDefinition, DefinitionEdit } from "../decorators/definition.js";
import type { DecoratorInspection, DecoratorInspectionRequest } from "../decorators/inspection.js";
import type { DecoratorEdit, DecoratorField, DecoratorInstance } from "../decorators/types.js";

export interface DecoratorCatalog {
  instances: readonly DecoratorInstance[];
  presets: readonly import("../decorators/presets.js").DecoratorPreset[];
  definitions: readonly (DecoratorDefinition & { enabled: boolean })[];
  builtins: { id: string; version: number; name: string; fields: readonly DecoratorField[] }[];
}
export interface DecoratorEnablement {
  id: string;
  version: number;
  enabled: boolean;
}
export interface DecoratorScriptApi {
  /** Read the current script candidate, including exact bundled source and enablement. */
  decorators(): Promise<DecoratorCatalog>;
  editDecorator(input: DecoratorEdit): Promise<DecoratorCatalog>;
  /** Install/replace is inert; explicitly enable the exact source before executing it. */
  editDecoratorDefinition(input: DefinitionEdit): Promise<DecoratorCatalog>;
  /** Session permission is committed only when the script succeeds; it is not archived. */
  enableDecorator(input: DecoratorEnablement): Promise<DecoratorCatalog>;
  /** Read-only eligibility, partition and diagnostics against the current candidate. */
  inspectDecorator(input: DecoratorInspectionRequest): Promise<DecoratorInspection>;
}
export type DecoratorScriptOperation =
  | { kind: "decorators"; input: Record<string, never> }
  | { kind: "editDecorator"; input: DecoratorEdit }
  | { kind: "editDecoratorDefinition"; input: DefinitionEdit }
  | { kind: "enableDecorator"; input: DecoratorEnablement }
  | { kind: "inspectDecorator"; input: DecoratorInspectionRequest };
