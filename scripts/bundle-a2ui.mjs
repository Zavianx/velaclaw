#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = path.join(rootDir, "src", "canvas-host", "a2ui", "a2ui.bundle.js");

function fail(message) {
  console.error(message);
  console.error("A2UI bundling failed. Ensure the prebuilt bundle is checked in.");
  process.exit(1);
}

async function pathExists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (await pathExists(outputFile)) {
    console.log("A2UI prebuilt bundle present; skipping source rebuild.");
    return;
  }

  if (process.env.VELACLAW_SPARSE_PROFILE || process.env.VELACLAW_A2UI_SKIP_MISSING === "1") {
    console.error(
      "A2UI prebuilt bundle missing; skipping because VELACLAW_A2UI_SKIP_MISSING=1 or VELACLAW_SPARSE_PROFILE is set.",
    );
    return;
  }

  fail(`A2UI prebuilt bundle missing at: ${outputFile}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
