import { runExtensionOxlint } from "./lib/run-extension-oxlint.mjs";

runExtensionOxlint({
  roots: ["extensions"],
  toolName: "oxlint-bundled-extensions",
  lockName: "oxlint-bundled-extensions",
  tempDirPrefix: "velaclaw-bundled-extension-oxlint-",
  emptyMessage: "No bundled extension files found.",
});
