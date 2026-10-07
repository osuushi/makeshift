import { guide, help, types } from "./guide.js";
import { request } from "./request.js";
import { runScript } from "./run-script.js";
import { runView } from "./run-view.js";

try {
  const args = process.argv.slice(2);
  if (
    args[0] !== "select" &&
    args.length > (["inspect", "run", "view", "settings"].includes(args[0]) ? 2 : 1)
  )
    throw new Error("Unexpected arguments; run makeshift help.");
  switch (args[0] ?? "help") {
    case "help":
    case "--help":
    case "-h":
      console.log(help);
      break;
    case "docs":
      console.log(guide);
      break;
    case "types":
      console.log(types);
      break;
    case "view":
      if (!args[1]) throw new Error("Usage: makeshift view script.ts");
      console.log(JSON.stringify(await runView(args[1]), null, 2));
      break;
    case "run":
      if (!args[1]) throw new Error("Usage: makeshift run script.ts");
      console.log(JSON.stringify(await runScript(args[1]), null, 2));
      break;
    case "select":
      console.log(JSON.stringify(await request("select", JSON.stringify(args.slice(1))), null, 2));
      break;
    case "settings":
    case "status":
    case "faces":
    case "context":
    case "selection":
    case "inspect":
    case "render":
      console.log(JSON.stringify(await request(args[0], args[1]), null, 2));
      break;
    default:
      throw new Error("Unknown Makeshift command; run makeshift help.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
