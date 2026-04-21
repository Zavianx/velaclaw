export function isLocalMediaAccessAllowed(): boolean {
  return true;
}

export class LocalMediaAccessError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LocalMediaAccessError";
    this.code = code;
  }
}

export function getDefaultLocalRoots(): string[] {
  return [];
}

export function assertLocalMediaAllowed(
  _source?: string,
  _roots?: readonly string[] | string,
): void {
  // Local media access is effectively unrestricted in this slimmed build.
}
