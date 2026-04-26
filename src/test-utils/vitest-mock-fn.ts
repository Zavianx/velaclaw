import type { Mock } from "vitest";

type AnyFn = (...args: never[]) => unknown;
type UnknownArgsFn = (...args: unknown[]) => unknown;

export type MockFn<T extends AnyFn = UnknownArgsFn> = Mock<T>;
