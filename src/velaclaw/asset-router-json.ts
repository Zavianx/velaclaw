function uniqueNonEmptySources(sources: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const source of sources) {
    const trimmed = source.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function extractFencedSources(text: string): string[] {
  const jsonSources: string[] = [];
  const otherSources: string[] = [];
  const fenceRe = /```([A-Za-z0-9_-]*)?[^\S\r\n]*(?:\r?\n)?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(text)) !== null) {
    const language = (match[1] ?? "").trim().toLowerCase();
    const body = match[2] ?? "";
    if (language === "json" || language === "") {
      jsonSources.push(body);
    } else {
      otherSources.push(body);
    }
  }
  return [...jsonSources, ...otherSources];
}

function extractBalancedJsonObjectCandidates(source: string): string[] {
  const candidates: string[] = [];
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== "{") {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") {
        depth += 1;
        continue;
      }
      if (char !== "}") {
        continue;
      }

      depth -= 1;
      if (depth === 0) {
        candidates.push(source.slice(start, index + 1));
        break;
      }
    }
  }
  return candidates;
}

export function parseAssetRouterJsonObject(text: string): Record<string, unknown> {
  const sources = uniqueNonEmptySources([...extractFencedSources(text), text]);
  let sawCandidate = false;
  let lastParseError = "";
  for (const source of sources) {
    for (const candidate of extractBalancedJsonObjectCandidates(source)) {
      sawCandidate = true;
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch (err) {
        lastParseError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  if (!sawCandidate) {
    throw new Error("router returned no JSON object");
  }
  throw new Error(
    lastParseError
      ? `router returned invalid JSON object: ${lastParseError}`
      : "router returned invalid JSON object",
  );
}
