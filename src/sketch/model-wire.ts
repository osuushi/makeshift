import type { SketchDocument } from "./document.js";
import type { ModelReply, ModelRequest, ModelView } from "./model-api.js";

export type ModelWireRequest = ModelRequest & { omitUnchangedData?: true };
export type ModelWireReply = Omit<ModelReply, "view"> & {
  view: Omit<ModelView, "data"> & { data?: SketchDocument };
};

/** A held visual extrusion cannot edit accepted data. Do not copy it per target. */
export function modelWireReply(request: ModelWireRequest, reply: ModelReply): ModelWireReply {
  if (
    request.omitUnchangedData &&
    request.kind === "extrude" &&
    request.presentation === "visual" &&
    reply.documentChanged === false &&
    !reply.error &&
    reply.view.visualPreview &&
    !reply.view.candidate
  ) {
    const { data: _data, ...view } = reply.view;
    return { ...reply, view };
  }
  return reply;
}
