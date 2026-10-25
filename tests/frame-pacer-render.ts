import { FramePacer } from "../src/sketch/frame-pacer.js";

/** Real WebGL2 completion across event-loop turns, including Safari's fence implementation. */
export async function framePacerRenderChecks() {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 unavailable");
  const pacer = new FramePacer(gl);
  const painted: number[] = [];
  const render = (value: number) => () => {
    painted.push(value);
    gl.clearColor(value / 40, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };
  try {
    pacer.request(render(0));
    for (let value = 1; value <= 40; value++) pacer.request(render(value));
    if (painted.length !== 1 || !pacer.pending) throw new Error("GPU frames accumulated");
    const deadline = performance.now() + 3000;
    while (pacer.pending && performance.now() < deadline) await new Promise(requestAnimationFrame);
    if (String(painted) !== "0,40" || pacer.pending)
      throw new Error(`Latest GPU frame did not settle: ${painted}`);
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    if (pixel[0] !== 255) throw new Error(`Stale GPU pixels: ${pixel}`);
    return { painted, pixel: [...pixel] };
  } finally {
    pacer.reset();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    canvas.remove();
  }
}
