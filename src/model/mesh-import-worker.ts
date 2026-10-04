import { readMeshFile } from "./mesh-import.js";

self.onmessage = (event: MessageEvent<{ name: string; bytes: ArrayBuffer }>) => {
  try {
    self.postMessage({ mesh: readMeshFile(event.data.name, event.data.bytes) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
