import {
  findInspectionTarget,
  inspectionOverview,
  targetGeometry,
} from "../agent/inspection-geometry.js";
import { inspectionView } from "../agent/inspection-view.js";
import type { BrowserDocuments } from "../model/browser-documents.js";
import type { WorkspaceCommand } from "../model/workspace-files.js";
import type { SketchEditor } from "../sketch/editor.js";
import { runWebScript } from "./agent-script.js";

interface SiteTool<Input> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute(input: Input, client?: { signal?: AbortSignal }): Promise<unknown>;
}

interface ToolContext {
  registerTool<T>(tool: SiteTool<T>, options: { signal: AbortSignal }): void | Promise<void>;
}

interface DrawingCommand {
  action: "inspect" | "types" | "run";
  source?: string;
  path?: string;
  id?: string;
}

const drawingDefinition = {
  name: "makeshift_run",
  description:
    "Inspect this open CAD drawing, get the makeshift scripting API types, or run JavaScript against its geometry. Await each makeshift method. Return a JSON value. A successful edit is one Undo step.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["action"],
    properties: {
      action: { type: "string", enum: ["inspect", "types", "run"] },
      source: {
        type: "string",
        description:
          "Async function body for run. Example: return await makeshift.createSketch({plane:'XY',curves:[{kind:'circle',center:{x:0,y:0},radius:10}]})",
      },
      path: {
        type: "string",
        description: "Alternatively run a UTF-8 JavaScript file in the drawing workspace.",
      },
      id: { type: "string", description: "Inspect one geometry ID in detail." },
    },
  },
  annotations: { readOnlyHint: false, untrustedContentHint: true },
};

export function installSiteTools(
  editor: SketchEditor,
  documents: BrowserDocuments,
  status: HTMLElement,
  progress: HTMLElement,
  cancel: HTMLButtonElement,
) {
  const context =
    (document as Document & { modelContext?: ToolContext }).modelContext ??
    (navigator as Navigator & { modelContext?: ToolContext }).modelContext;
  const lifetime = new AbortController();
  let active: AbortController | undefined;
  cancel.onclick = () => active?.abort();
  const close = () => {
    lifetime.abort();
    active?.abort();
  };
  if (typeof context?.registerTool !== "function") {
    status.textContent = "This browser hasn’t exposed WebMCP to this page.";
    return close;
  }

  const drawing: SiteTool<DrawingCommand> = {
    ...drawingDefinition,
    async execute(input, client) {
      try {
        if (input.action === "types")
          return (await import("../agent-cli/script-types.js")).scriptTypes;
        if (active || documents.blocked() || document.querySelector("dialog[open]"))
          throw new Error("Finish the current operation first.");
        if (input.action === "inspect") {
          const view = inspectionView(editor, false),
            data = editor.store.acceptedData;
          return input.id
            ? targetGeometry(data, findInspectionTarget(data, input.id))
            : { selection: view.selection, ...inspectionOverview(data, view) };
        }
        if (
          input.action !== "run" ||
          (typeof input.source === "string") === (typeof input.path === "string")
        )
          throw new Error("Use run with either source or path.");
        const controller = new AbortController();
        active = controller;
        progress.hidden = false;
        try {
          const source =
            input.path === undefined
              ? input.source
              : await documents.workspace({ op: "cat", path: input.path });
          if (typeof source !== "string") throw new Error("Expected JavaScript source.");
          controller.signal.throwIfAborted();
          client?.signal?.throwIfAborted();
          return await runWebScript(
            editor,
            source,
            client?.signal
              ? AbortSignal.any([controller.signal, client.signal])
              : controller.signal,
          );
        } finally {
          progress.hidden = true;
          active = undefined;
        }
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
  void (async () => {
    try {
      await context.registerTool(drawing, { signal: lifetime.signal });
      await context.registerTool(workspaceTool(documents), { signal: lifetime.signal });
      status.textContent = "Makeshift’s tools are registered in this tab.";
    } catch {
      close();
      status.textContent = "This browser could not register Makeshift’s tools.";
    }
  })();
  return close;
}

function workspaceTool(documents: BrowserDocuments): SiteTool<WorkspaceCommand> {
  return {
    name: "makeshift_workspace",
    description:
      "Work with files inside this drawing’s workspace archive. Save the drawing to keep changes. File edits are outside geometry Undo. Parent directories are implicit. cp and mv take exact file paths and overwrite the destination.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["op"],
      properties: {
        op: { type: "string", enum: ["ls", "cat", "write", "append", "cp", "mv", "rm"] },
        path: {
          type: "string",
          description: "Workspace-relative file path, or directory for ls. Omit to list the root.",
        },
        to: { type: "string", description: "Destination for cp or mv." },
        data: { type: "string", description: "Contents for write or append." },
        encoding: {
          type: "string",
          enum: ["utf8", "base64"],
          description: "Contents encoding for cat, write, or append. Defaults to UTF-8.",
        },
      },
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    async execute(command) {
      try {
        return await documents.workspace(command);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
