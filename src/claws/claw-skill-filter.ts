export function mergeSkillFilters(outer?: string[], inner?: string[]): string[] | undefined {
  if (!outer && !inner) {
    return undefined;
  }
  if (!outer) {
    return inner;
  }
  if (!inner) {
    return outer;
  }
  if (outer.length === 0 || inner.length === 0) {
    return [];
  }
  const innerSet = new Set(inner);
  return outer.filter((name) => innerSet.has(name));
}

export function resolveClawSkillFilter(params: {
  requestFilter?: string[];
  clawFilter?: string[];
  agentFilter?: string[];
}): string[] | undefined {
  return mergeSkillFilters(
    mergeSkillFilters(params.requestFilter, params.clawFilter),
    params.agentFilter,
  );
}
