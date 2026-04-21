export type PollInput = {
  question: string;
  options: string[];
  allowMultipleAnswers?: boolean;
  maxSelections?: number;
  durationHours?: number;
  durationSeconds?: number | null;
};

export function resolvePollMaxSelections(
  optionsOrParams?: number | { maxSelections?: unknown },
  allowMultiselect?: boolean,
): number {
  if (typeof optionsOrParams === "number") {
    return allowMultiselect ? Math.max(1, Math.floor(optionsOrParams)) : 1;
  }
  const value =
    typeof optionsOrParams?.maxSelections === "number" ? optionsOrParams.maxSelections : undefined;
  return value && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

export function normalizePollInput<T extends Record<string, unknown>>(
  input: T,
  _options?: { maxOptions?: number },
): T {
  return input;
}

export function normalizePollDurationHours(
  value?: number | null,
  options?: { defaultHours?: number; maxHours?: number },
): number | undefined {
  const maxHours = options?.maxHours ?? 168;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return options?.defaultHours;
  }
  return Math.max(1, Math.min(maxHours, Math.floor(value)));
}
