import path from "node:path";

function normalizeRoot(value: string): string {
  return path.resolve(value).replace(/[\\/]+$/, "");
}

export function isValidInboundPathRootPattern(value: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return path.isAbsolute(trimmed) || trimmed.startsWith(".");
}

export function mergeInboundPathRoots(
  ...groups: Array<readonly (string | undefined | null)[] | undefined | null>
): string[] {
  const merged = new Set<string>();
  for (const group of groups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const entry of group) {
      if (typeof entry !== "string") {
        continue;
      }
      const trimmed = entry.trim();
      if (!trimmed || !isValidInboundPathRootPattern(trimmed)) {
        continue;
      }
      merged.add(normalizeRoot(trimmed));
    }
  }
  return [...merged];
}

export function isInboundPathAllowed(
  filePathOrParams: string | { filePath: string; roots: readonly string[] },
  roots?: readonly string[],
): boolean {
  let filePath: string;
  let resolvedRoots: readonly string[];
  if (typeof filePathOrParams === "object") {
    filePath = filePathOrParams.filePath;
    resolvedRoots = filePathOrParams.roots;
  } else {
    filePath = filePathOrParams;
    resolvedRoots = roots ?? [];
  }
  if (typeof filePath !== "string" || !filePath.trim()) {
    return false;
  }
  const resolvedFile = path.resolve(filePath);
  for (const root of resolvedRoots) {
    if (typeof root !== "string" || !root.trim()) {
      continue;
    }
    const normalizedRoot = normalizeRoot(root);
    if (resolvedFile === normalizedRoot || resolvedFile.startsWith(`${normalizedRoot}${path.sep}`)) {
      return true;
    }
  }
  return false;
}
