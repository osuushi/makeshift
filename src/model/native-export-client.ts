export interface NativeExportBridge {
  integrate(input: ArrayBuffer): Promise<ArrayBuffer>;
  cancel(): Promise<void>;
}
declare global {
  interface Window {
    makeshiftMesh?: NativeExportBridge;
  }
}

/** Electron supplies IPC; browser development can use its local native backend. */
export async function nativeExportClient(): Promise<NativeExportBridge | undefined> {
  if (window.makeshiftMesh) return window.makeshiftMesh;
  if (window.makeshiftModel || location.protocol === "file:") return undefined;
  try {
    const response = await fetch("/mesh-export", { method: "GET" });
    if (
      !response.ok ||
      response.headers.get("content-type") !== "application/json" ||
      !(await response.json()).native
    )
      return undefined;
  } catch {
    return undefined;
  }
  let active: AbortController | undefined;
  return {
    async integrate(input) {
      const controller = new AbortController();
      active = controller;
      try {
        const response = await fetch("/mesh-export", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: input,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await response.text());
        return await response.arrayBuffer();
      } finally {
        if (active === controller) active = undefined;
      }
    },
    async cancel() {
      active?.abort();
      await fetch("/mesh-export", { method: "DELETE" });
    },
  };
}
