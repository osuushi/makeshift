export function webBuildConfig(): {
  exceptions: "javascript" | "wasm";
  cache: string;
  buildPrefix: string;
  flag:
    | "-fexceptions -UOCC_CONVERT_SIGNALS"
    | "-fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0 -UOCC_CONVERT_SIGNALS";
};
