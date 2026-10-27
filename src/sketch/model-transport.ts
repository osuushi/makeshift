import type { SketchDocument } from "./document.js";
import type { ModelReply, ModelRequest } from "./model-api.js";
import type { ModelWireReply, ModelWireRequest } from "./model-wire.js";

declare global {
  interface Window {
    makeshiftModel?: (request: ModelWireRequest) => Promise<ModelWireReply>;
  }
}
export async function call(request: ModelRequest, accepted?: SketchDocument): Promise<ModelReply> {
  const reuse = request.kind === "extrude" && request.presentation === "visual" && accepted;
  const reply = await send(reuse ? { ...request, omitUnchangedData: true } : request);
  const data = reply.view.data ?? (reuse ? accepted : undefined);
  if (!data) throw new Error("Model reply is missing accepted geometry");
  return { ...reply, view: { ...reply.view, data } };
}

async function send(request: ModelWireRequest): Promise<ModelWireReply> {
  if (window.makeshiftModel) return window.makeshiftModel(request);
  const response = await fetch("/sketch-api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error("Sketch backend is unavailable");
  return response.json();
}
