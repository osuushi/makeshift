import { reopenBoolean, reopenExtrude, reopenExtrudeParameters } from "./ui-reopen-first.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await reopenExtrude(page, name);
    console.log(`${name}: Extrude Union→New, exact Cancel/Redo and normal branch passed`);
    await reopenExtrudeParameters(page, name);
    console.log(`${name}: symmetric distance/draft unit/twist and restored modal baseline passed`);
    await reopenBoolean(page, name);
    console.log(
      `${name}: ordered Boolean inputs, consumed-body restoration, Keep originals and completion choice passed`,
    );
  },
  { timeout: 120000 },
);
