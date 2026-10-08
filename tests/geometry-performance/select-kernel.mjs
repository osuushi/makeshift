// Research-only Node --import hook for compiled model tests. Compile with tsc
// first; set GEOMETRY_RESEARCH_KERNEL to an immutable executable. This changes
// the test process's default calculator path, not application source or the SDK.
import assert from "node:assert/strict";
import { accessSync, constants } from "node:fs";
import { resolve } from "node:path";
import { SolidCalculator } from "../../.cache/sketch-tests/src/backend/solid-calculator.js";

assert.ok(process.env.GEOMETRY_RESEARCH_KERNEL, "Expected GEOMETRY_RESEARCH_KERNEL");
const executable = resolve(process.env.GEOMETRY_RESEARCH_KERNEL);
accessSync(executable, constants.X_OK);
SolidCalculator.executable = executable;
