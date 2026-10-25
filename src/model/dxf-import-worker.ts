import { readDxf } from "./dxf-import.js";

self.onmessage = (event: MessageEvent<string>) => {
  try {
    self.postMessage({ result: readDxf(event.data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
