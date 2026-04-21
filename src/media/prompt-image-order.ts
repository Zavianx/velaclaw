export type PromptImageOrderEntry = "inline" | "offloaded";

export function sortPromptImages<T>(items: T[]): T[] {
  return [...items];
}
