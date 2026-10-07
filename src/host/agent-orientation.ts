import { writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import type { InspectionCommand } from "../agent/inspection-protocol.js";
import { guide, types } from "../agent-cli/guide.js";
import { startupGuide } from "../agent-cli/startup-guide.js";
import type { ScriptRequest } from "../agent-script/api.js";
import type { DocumentStatus } from "../model/document-host.js";
import { AgentConnection } from "./agent-connection.js";
import { writeAgentLauncher } from "./agent-launcher.js";

export const launchGuidance = `You are running inside Makeshift for one CAD drawing.\n${startupGuide}`;

export async function prepareOrientation(
  cwd: string,
  env: NodeJS.ProcessEnv,
  status: () => DocumentStatus,
  inspect: (
    command: InspectionCommand,
    entity: string | undefined,
    directory: string,
  ) => Promise<unknown>,
  script: (request: ScriptRequest, channel: string) => Promise<unknown>,
): Promise<AgentConnection> {
  const connection = await AgentConnection.create((request, directory) => {
    const current = status();
    if (request.command === "script") {
      if (!request.script) throw new Error("Invalid script request");
      return script(request.script, directory);
    }
    if (request.command !== "status") return inspect(request.command, request.entity, directory);
    return {
      application: "Makeshift",
      document: { name: current.name, saved: !!current.path, edited: current.edited, units: "mm" },
      capabilities: [
        "help",
        "docs",
        "types",
        "status",
        "selection",
        "select",
        "inspect",
        "render",
        "run",
        "view",
        "faces",
        "context",
        "settings",
      ],
    };
  });
  try {
    await writeFile(join(cwd, "AGENTS.md"), startupGuide, { flag: "wx", mode: 0o600 }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      },
    );
    const cli = await writeAgentLauncher(connection.directory);
    const docs = join(connection.directory, "makeshift.md"),
      api = join(connection.directory, "makeshift.d.ts");
    await writeFile(docs, guide, { mode: 0o600 });
    await writeFile(api, types, { mode: 0o600 });
    Object.assign(env, {
      MAKESHIFT_CLI: cli,
      MAKESHIFT_WORKSPACE: cwd,
      MAKESHIFT_ENDPOINT: connection.directory,
      MAKESHIFT_CAPABILITY: connection.capability,
      MAKESHIFT_DOCS: docs,
      MAKESHIFT_API_TYPES: api,
      PATH: `${connection.directory}${delimiter}${env.PATH ?? ""}`,
    });
    for (const key of ["CLI", "WORKSPACE", "ENDPOINT", "CAPABILITY", "DOCS", "API_TYPES"])
      env[`FREAC_${key}`] = env[`MAKESHIFT_${key}`];
    return connection;
  } catch (error) {
    await connection.close();
    throw error;
  }
}

export function orientationOverrides(env: NodeJS.ProcessEnv): string[] {
  const keys = [
    "MAKESHIFT_CLI",
    "MAKESHIFT_WORKSPACE",
    "MAKESHIFT_ENDPOINT",
    "MAKESHIFT_CAPABILITY",
    "MAKESHIFT_DOCS",
    "MAKESHIFT_API_TYPES",
    "FREAC_CLI",
    "FREAC_WORKSPACE",
    "FREAC_ENDPOINT",
    "FREAC_CAPABILITY",
    "FREAC_DOCS",
    "FREAC_API_TYPES",
    "PATH",
  ];
  const values = keys.map((key) => [key, env[key]]);
  return [
    "-c",
    `developer_instructions=${JSON.stringify(launchGuidance)}`,
    ...values.flatMap(([key, value]) => [
      "-c",
      `shell_environment_policy.set.${key}=${JSON.stringify(value)}`,
    ]),
  ];
}
