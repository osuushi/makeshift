declare module "virtual:wasm-assets" {
  const assets: Record<"solver" | "kernel", { js: string; wasm: string; side?: string }>;
  export default assets;
}
