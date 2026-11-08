import type { ScriptOperation } from "./api.js";
import type { DecoratorScriptApi } from "./public/decorator.js";

export type { DecoratorCatalog, DecoratorScriptApi } from "./public/decorator.js";
export type DecoratorEnablement = Parameters<DecoratorScriptApi["enableDecorator"]>[0];
export type DecoratorScriptOperation = Extract<
  ScriptOperation,
  {
    kind:
      | "decorators"
      | "editDecorator"
      | "editDecoratorDefinition"
      | "enableDecorator"
      | "inspectDecorator";
  }
>;
