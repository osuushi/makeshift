import type { MakeshiftScript } from "./public/modeling.js";

export type { MeshFitResult } from "./public/mesh-fit.js";
export type {
  MakeshiftScript as ScriptApi,
  ScaleResult,
  ScriptCurve,
  SketchResult,
  SolidResult,
} from "./public/modeling.js";
export type SketchInput = Parameters<MakeshiftScript["createSketch"]>[0];
export type PlaneInput = Parameters<MakeshiftScript["constructionPlane"]>[0];
export type PlaneResult = Awaited<ReturnType<MakeshiftScript["constructionPlane"]>>;

type Method = Exclude<keyof MakeshiftScript, "selection">;
/** The worker's serial commands are derived from the public API, including no-argument reads. */
export type ScriptOperation = {
  [Kind in Method]: {
    kind: Kind;
    input: Parameters<MakeshiftScript[Kind]> extends []
      ? Record<string, never>
      : Parameters<MakeshiftScript[Kind]>[0];
  };
}[Method];
export type ScriptResult = Awaited<ReturnType<MakeshiftScript[Method]>>;

export interface ScriptRequest {
  action: "begin" | "step" | "finish" | "cancel" | "poll";
  token?: string;
  name?: string;
  error?: string;
  operation?: ScriptOperation;
}
