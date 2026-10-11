import type { ModelCall } from "./model-api.js";

declare global {
  interface Window {
    makeshiftModel?: ModelCall;
  }
}
export const call: ModelCall = async (request) => {
  if (window.makeshiftModel) return window.makeshiftModel(request);
  const response = await fetch("/sketch-api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error("Sketch backend is unavailable");
  return response.json();
};
