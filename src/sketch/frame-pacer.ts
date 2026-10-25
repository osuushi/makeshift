/** Keep one GPU frame in flight and one request for the latest scene, never a frame queue. */
export class FramePacer {
  private fence: WebGLSync | null = null;
  private scheduled: number | null = null;
  private latest: (() => void) | null = null;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly ready: () => boolean = () => true,
  ) {}

  get pending(): boolean {
    return this.latest !== null;
  }

  request(render: () => void, force = false): void {
    if (force) this.reset();
    this.latest = render;
    // A fresh camera draw supersedes an older retry. Leaving that retry in
    // control can starve forever when it always runs before the camera RAF.
    if (this.scheduled !== null) cancelAnimationFrame(this.scheduled);
    this.scheduled = null;
    this.present(render, force);
  }

  private present(render: () => void, force = false): void {
    const gl = this.gl;
    if (gl.isContextLost()) {
      this.reset();
      return;
    }
    // A queued camera refresh must update grids, clipping and overlays first.
    if (!force && !this.ready()) {
      this.schedule();
      return;
    }
    if (this.fence) {
      const status = gl.clientWaitSync(this.fence, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) {
        this.schedule();
        return;
      }
      gl.deleteSync(this.fence);
      this.fence = null;
    }
    this.latest = null;
    render();
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  }

  private schedule(): void {
    this.scheduled = requestAnimationFrame(() => {
      this.scheduled = null;
      if (this.latest) this.present(this.latest);
    });
  }

  reset(): void {
    if (this.scheduled !== null) cancelAnimationFrame(this.scheduled);
    this.scheduled = null;
    this.latest = null;
    if (this.fence) this.gl.deleteSync(this.fence);
    this.fence = null;
  }
}
