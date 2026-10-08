import { randomUUID } from "node:crypto";
import type { InspectionView } from "../agent/inspection-protocol.js";
import type { ScriptRequest } from "../agent-script/api.js";
import { scriptTimeoutMs } from "../model/calculation-limits.js";
import type { ModelView } from "../sketch/model-api.js";
import type { DocumentOwner } from "./document-owner.js";

/** One document-bound script. Tokens scope the invocation, never document revisions. */
export class ScriptSession {
  private token: string | null = null;
  private channel: string | null = null;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setTimeout> | undefined;
  private pending = false;
  private acquiring = false;
  private acquisitionCancelled = false;
  constructor(
    private owner: DocumentOwner,
    private acquire: () => Promise<InspectionView>,
    private publish: (running: boolean, view: ModelView) => void,
    private available: () => boolean,
    private changed: () => void,
  ) {}
  get busy(): boolean {
    return this.token !== null || this.acquiring;
  }
  async request(request: ScriptRequest, channel: string): Promise<unknown> {
    if (request?.action === "begin") return this.begin(request.name, channel);
    if (!this.token || request?.token !== this.token || channel !== this.channel)
      throw new Error("This script has ended or its connection has closed");
    if (request.action === "poll") {
      this.keepAlive();
      return { running: true };
    }
    if (request.action === "cancel") {
      await this.cancel(
        typeof request.error === "string" ? request.error.slice(0, 2000) : undefined,
      );
      return { cancelled: true };
    }
    if (this.pending) {
      await this.cancel("Parallel script operations are unsupported");
      throw new Error("Await each operation");
    }
    this.pending = true;
    try {
      if (!this.available()) throw new Error("The drawing connection has closed");
      if (request.action === "step" && request.operation)
        return await this.owner.scripts.step(request.operation);
      if (request.action !== "finish") throw new Error("Invalid script request");
      const changed = this.owner.scripts.finish();
      this.end();
      return { changed };
    } catch (error) {
      await this.cancel(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.pending = false;
    }
  }
  private async begin(name: string | undefined, channel: string): Promise<unknown> {
    if (!this.available() || this.busy) throw new Error("Finish the current operation first");
    if (typeof name !== "string" || !name || name.length > 256)
      throw new Error("Invalid script name");
    this.acquiring = true;
    this.acquisitionCancelled = false;
    try {
      // Complete the renderer's modal before acquiring backend script ownership.
      const view = await this.acquire();
      if (this.acquisitionCancelled || !this.available())
        throw new Error("Script cancelled before start");
      this.owner.beginScript(name);
      const token = randomUUID();
      this.token = token;
      this.channel = channel;
      this.deadline = setTimeout(
        () => void this.cancel("Script exceeded the 15-minute limit"),
        scriptTimeoutMs,
      );
      this.keepAlive();
      this.publish(true, this.owner.view);
      return { token, selection: view.selection };
    } catch (error) {
      if (this.token) await this.cancel();
      else this.publish(false, this.owner.view);
      throw error;
    } finally {
      this.acquiring = false;
    }
  }
  private keepAlive(): void {
    clearTimeout(this.heartbeat);
    this.heartbeat = setTimeout(() => void this.cancel("Script runner disconnected"), 5000);
  }
  async cancel(error = "Script cancelled"): Promise<void> {
    if (this.acquiring) this.acquisitionCancelled = true;
    if (!this.token) return;
    const token = this.token;
    await this.owner.scripts.cancel(error);
    if (this.token === token) this.end();
  }
  private end(): void {
    clearTimeout(this.deadline);
    clearTimeout(this.heartbeat);
    this.token = null;
    this.channel = null;
    this.publish(false, this.owner.view);
    this.changed();
  }
}
