import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix, resolve } from "node:path";

export const EXTENSION_PACKAGE_BOUNDARY_BASE_CONFIG =
  "extensions/tsconfig.package-boundary.base.json" as const;

export const EXTENSION_PACKAGE_BOUNDARY_INCLUDE = ["./*.ts", "./src/**/*.ts"] as const;
export const EXTENSION_PACKAGE_BOUNDARY_EXCLUDE = [
  "./**/*.test.ts",
  "./dist/**",
  "./node_modules/**",
  "./src/test-support/**",
  "./src/**/*test-helpers.ts",
  "./src/**/*test-harness.ts",
  "./src/**/*test-support.ts",
] as const;
export const EXTENSION_PACKAGE_BOUNDARY_BASE_PATHS = {
  "velaclaw/extension-api": ["../src/extensionAPI.ts"],
  "velaclaw/plugin-sdk": ["../dist/plugin-sdk/src/plugin-sdk/index.d.ts"],
  "velaclaw/plugin-sdk/*": ["../dist/plugin-sdk/src/plugin-sdk/*.d.ts"],
  "velaclaw/plugin-sdk/account-id": ["../dist/plugin-sdk/src/plugin-sdk/account-id.d.ts"],
  "velaclaw/plugin-sdk/channel-entry-contract": [
    "../packages/plugin-sdk/dist/src/plugin-sdk/channel-entry-contract.d.ts",
  ],
  "velaclaw/plugin-sdk/browser-maintenance": [
    "../packages/plugin-sdk/dist/extensions/browser/browser-maintenance.d.ts",
  ],
  "velaclaw/plugin-sdk/browser-config-runtime": [
    "../dist/plugin-sdk/src/plugin-sdk/browser-config-runtime.d.ts",
  ],
  "velaclaw/plugin-sdk/browser-node-runtime": [
    "../dist/plugin-sdk/src/plugin-sdk/browser-node-runtime.d.ts",
  ],
  "velaclaw/plugin-sdk/browser-setup-tools": [
    "../dist/plugin-sdk/src/plugin-sdk/browser-setup-tools.d.ts",
  ],
  "velaclaw/plugin-sdk/browser-security-runtime": [
    "../dist/plugin-sdk/src/plugin-sdk/browser-security-runtime.d.ts",
  ],
  "velaclaw/plugin-sdk/channel-secret-basic-runtime": [
    "../packages/plugin-sdk/dist/src/plugin-sdk/channel-secret-basic-runtime.d.ts",
  ],
  "velaclaw/plugin-sdk/channel-secret-runtime": [
    "../dist/plugin-sdk/src/plugin-sdk/channel-secret-runtime.d.ts",
  ],
  "velaclaw/plugin-sdk/channel-secret-tts-runtime": [
    "../packages/plugin-sdk/dist/src/plugin-sdk/channel-secret-tts-runtime.d.ts",
  ],
  "velaclaw/plugin-sdk/channel-streaming": [
    "../dist/plugin-sdk/src/plugin-sdk/channel-streaming.d.ts",
  ],
  "velaclaw/plugin-sdk/error-runtime": ["../dist/plugin-sdk/src/plugin-sdk/error-runtime.d.ts"],
  "velaclaw/plugin-sdk/provider-catalog-shared": [
    "../packages/plugin-sdk/dist/src/plugin-sdk/provider-catalog-shared.d.ts",
  ],
  "velaclaw/plugin-sdk/provider-entry": [
    "../packages/plugin-sdk/dist/src/plugin-sdk/provider-entry.d.ts",
  ],
  "velaclaw/plugin-sdk/secret-ref-runtime": [
    "../dist/plugin-sdk/src/plugin-sdk/secret-ref-runtime.d.ts",
  ],
  "velaclaw/plugin-sdk/ssrf-runtime": ["../dist/plugin-sdk/src/plugin-sdk/ssrf-runtime.d.ts"],
  "@velaclaw/qa-channel/api.js": ["../dist/plugin-sdk/extensions/qa-channel/api.d.ts"],
  "@velaclaw/*.js": ["../packages/plugin-sdk/dist/extensions/*.d.ts", "../extensions/*"],
  "@velaclaw/*": ["../packages/plugin-sdk/dist/extensions/*", "../extensions/*"],
  "@velaclaw/plugin-sdk/*": ["../dist/plugin-sdk/src/plugin-sdk/*.d.ts"],
} as const;

function prefixExtensionPackageBoundaryPaths(
  paths: Record<string, readonly string[]>,
  prefix: string,
): Record<string, readonly string[]> {
  return Object.fromEntries(
    Object.entries(paths).map(([key, values]) => [
      key,
      values.map((value) => posix.join(prefix, value)),
    ]),
  );
}

export const EXTENSION_PACKAGE_BOUNDARY_XAI_PATHS = {
  ...prefixExtensionPackageBoundaryPaths(
    (({
      "velaclaw/plugin-sdk/channel-secret-basic-runtime": _omitBasic,
      "velaclaw/plugin-sdk/channel-secret-tts-runtime": _omitTts,
      ...rest
    }) => rest)(EXTENSION_PACKAGE_BOUNDARY_BASE_PATHS),
    "../",
  ),
  "velaclaw/plugin-sdk/channel-entry-contract": [
    "../../dist/plugin-sdk/src/plugin-sdk/channel-entry-contract.d.ts",
  ],
  "velaclaw/plugin-sdk/browser-maintenance": [
    "../../dist/plugin-sdk/src/plugin-sdk/browser-maintenance.d.ts",
  ],
  "velaclaw/plugin-sdk/cli-runtime": ["../../dist/plugin-sdk/src/plugin-sdk/cli-runtime.d.ts"],
  "velaclaw/plugin-sdk/provider-catalog-shared": [
    "../../dist/plugin-sdk/src/plugin-sdk/provider-catalog-shared.d.ts",
  ],
  "velaclaw/plugin-sdk/provider-env-vars": [
    "../../dist/plugin-sdk/src/plugin-sdk/provider-env-vars.d.ts",
  ],
  "velaclaw/plugin-sdk/provider-entry": [
    "../../dist/plugin-sdk/src/plugin-sdk/provider-entry.d.ts",
  ],
  "velaclaw/plugin-sdk/provider-web-search-contract": [
    "../../dist/plugin-sdk/src/plugin-sdk/provider-web-search-contract.d.ts",
  ],
  "@velaclaw/qa-channel/api.js": ["../../dist/plugin-sdk/extensions/qa-channel/api.d.ts"],
  "@velaclaw/*.js": ["../../packages/plugin-sdk/dist/extensions/*.d.ts", "../*"],
  "@velaclaw/*": ["../*"],
  "@velaclaw/plugin-sdk/*": ["../../dist/plugin-sdk/src/plugin-sdk/*.d.ts"],
  "@velaclaw/anthropic-vertex/api.js": ["./.boundary-stubs/anthropic-vertex-api.d.ts"],
  "@velaclaw/ollama/api.js": ["./.boundary-stubs/ollama-api.d.ts"],
  "@velaclaw/ollama/runtime-api.js": ["./.boundary-stubs/ollama-runtime-api.d.ts"],
  "@velaclaw/speech-core/runtime-api.js": ["./.boundary-stubs/speech-core-runtime-api.d.ts"],
} as const;

export type ExtensionPackageBoundaryTsConfigJson = {
  extends?: unknown;
  compilerOptions?: {
    rootDir?: unknown;
    paths?: unknown;
  };
  include?: unknown;
  exclude?: unknown;
};

export type ExtensionPackageBoundaryPackageJson = {
  devDependencies?: Record<string, string>;
};

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function collectBundledExtensionIds(rootDir = resolve(".")): string[] {
  return readdirSync(join(rootDir, "extensions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

export function resolveExtensionTsconfigPath(extensionId: string, rootDir = resolve(".")): string {
  return join(rootDir, "extensions", extensionId, "tsconfig.json");
}

export function resolveExtensionPackageJsonPath(
  extensionId: string,
  rootDir = resolve("."),
): string {
  return join(rootDir, "extensions", extensionId, "package.json");
}

export function readExtensionPackageBoundaryTsconfig(
  extensionId: string,
  rootDir = resolve("."),
): ExtensionPackageBoundaryTsConfigJson {
  return readJsonFile<ExtensionPackageBoundaryTsConfigJson>(
    resolveExtensionTsconfigPath(extensionId, rootDir),
  );
}

export function readExtensionPackageBoundaryPackageJson(
  extensionId: string,
  rootDir = resolve("."),
): ExtensionPackageBoundaryPackageJson {
  return readJsonFile<ExtensionPackageBoundaryPackageJson>(
    resolveExtensionPackageJsonPath(extensionId, rootDir),
  );
}

export function isOptInExtensionPackageBoundaryTsconfig(
  tsconfig: ExtensionPackageBoundaryTsConfigJson,
): boolean {
  return tsconfig.extends === "../tsconfig.package-boundary.base.json";
}

export function collectExtensionsWithTsconfig(rootDir = resolve(".")): string[] {
  return collectBundledExtensionIds(rootDir).filter((extensionId) =>
    existsSync(resolveExtensionTsconfigPath(extensionId, rootDir)),
  );
}

export function collectOptInExtensionPackageBoundaries(rootDir = resolve(".")): string[] {
  return collectExtensionsWithTsconfig(rootDir).filter((extensionId) =>
    isOptInExtensionPackageBoundaryTsconfig(
      readExtensionPackageBoundaryTsconfig(extensionId, rootDir),
    ),
  );
}

export function renderExtensionPackageBoundaryTsconfig(params?: {
  paths?: Record<string, readonly string[]>;
}): {
  extends: "../tsconfig.package-boundary.base.json";
  compilerOptions: { rootDir: "."; paths?: Record<string, readonly string[]> };
  include: typeof EXTENSION_PACKAGE_BOUNDARY_INCLUDE;
  exclude: typeof EXTENSION_PACKAGE_BOUNDARY_EXCLUDE;
} {
  return {
    extends: "../tsconfig.package-boundary.base.json",
    compilerOptions: {
      rootDir: ".",
      ...(params?.paths
        ? {
            paths: {
              ...EXTENSION_PACKAGE_BOUNDARY_BASE_PATHS,
              ...params.paths,
            },
          }
        : {}),
    },
    include: EXTENSION_PACKAGE_BOUNDARY_INCLUDE,
    exclude: EXTENSION_PACKAGE_BOUNDARY_EXCLUDE,
  };
}
