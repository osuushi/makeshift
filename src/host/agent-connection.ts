import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdtemp, open, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InspectionCommand } from "../agent/inspection-protocol.js";
import type { ScriptRequest } from "../agent-script/api.js";

export interface ConnectionRequest {
  command: "status" | "script" | InspectionCommand;
  entity?: string;
  script?: ScriptRequest;
}

/** Private file transport works inside harness sandboxes without enabling networking. */
export class AgentConnection {
  readonly capability = randomBytes(32).toString("hex");
  private active = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> = Promise.resolve();
  private inFlight = new Map<string, Promise<void>>();
  private exclusive: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  private constructor(
    readonly directory: string,
    private handle: (request: ConnectionRequest, directory: string) => unknown | Promise<unknown>,
  ) {}

  static async create(handle: AgentConnection["handle"]): Promise<AgentConnection> {
    const connection = new AgentConnection(
      await mkdtemp(join(tmpdir(), "makeshift-agent-")),
      handle,
    );
    connection.schedule();
    return connection;
  }
  private schedule(): void {
    if (!this.active) return;
    this.timer = setTimeout(() => {
      this.pending = this.scan()
        .catch(console.error)
        .finally(() => this.schedule());
    }, 40);
    this.timer.unref();
  }
  private async scan(): Promise<void> {
    const names = await readdir(this.directory);
    for (const name of names.filter((n) => /^[a-f0-9-]{36}\.request$/.test(n))) {
      if (!this.active) return;
      if (this.inFlight.has(name)) continue;
      if (this.inFlight.size >= 32) break;
      const pending = this.respond(name)
        .catch(console.error)
        .finally(() => this.inFlight.delete(name));
      this.inFlight.set(name, pending);
    }
  }
  private async respond(name: string): Promise<void> {
    const path = join(this.directory, name);
    let reply: { result?: unknown; error?: string };
    try {
      const file = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      let request: { capability?: unknown; command?: unknown; entity?: unknown; script?: unknown };
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 262144) throw new Error("Invalid Makeshift request.");
        const bytes = Buffer.alloc(262145);
        const { bytesRead } = await file.read(bytes);
        if (bytesRead > 262144) throw new Error("Invalid Makeshift request.");
        request = JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
      } finally {
        await file.close();
      }
      if (request?.capability !== this.capability) throw new Error("Invalid Makeshift connection.");
      if (
        typeof request.command !== "string" ||
        ![
          "status",
          "selection",
          "inspect",
          "render",
          "select",
          "faces",
          "context",
          "settings",
          "script",
        ].includes(request.command)
      )
        throw new Error("Unknown Makeshift command; run makeshift help.");
      if (
        request.entity !== undefined &&
        (!["inspect", "select", "settings"].includes(request.command as string) ||
          typeof request.entity !== "string" ||
          request.entity.length >
            (request.command === "select" || request.command === "settings" ? 65536 : 256))
      )
        throw new Error("Invalid inspection ID.");
      if (!this.active) return;
      reply = { result: await this.dispatch(request as ConnectionRequest, path) };
    } catch (error) {
      reply = { error: error instanceof Error ? error.message : String(error) };
    }
    if (!this.active) return;
    const response = path.replace(/\.request$/, ".response");
    const temporary = `${response}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(reply), { flag: "wx", mode: 0o600 });
      if (this.active) await rename(temporary, response);
    } finally {
      await rm(temporary, { force: true });
      await rm(path, { force: true });
    }
  }
  private async dispatch(request: ConnectionRequest, path: string): Promise<unknown> {
    const control =
      request.command === "script" && ["poll", "cancel"].includes(request.script?.action ?? "");
    if (control || request.command === "status") return this.handle(request, this.directory);
    // Bound waiting work while leaving transport slots for status and cancellation.
    if (this.waiting >= 16) throw new Error("Too many pending Makeshift commands.");
    this.waiting++;
    const pending = this.exclusive.then(async () => {
      if (!this.active) throw new Error("This Makeshift connection has closed.");
      // A caller that timed out removes its request; do not execute abandoned work.
      await access(path);
      if (!this.active) throw new Error("This Makeshift connection has closed.");
      return this.handle(request, this.directory);
    });
    this.exclusive = pending.catch(() => {});
    try {
      return await pending;
    } finally {
      this.waiting--;
    }
  }
  async close(): Promise<void> {
    this.active = false;
    clearTimeout(this.timer);
    await this.pending;
    await Promise.allSettled(this.inFlight.values());
    await rm(this.directory, { recursive: true, force: true });
  }
}
