export type CaptureQueryPreset = "all" | "errors" | "none";

export type CaptureEventRecord = {
  id?: string | number;
  timestamp?: string;
  direction?: string;
  kind?: string;
  url?: string;
  method?: string;
  status?: number;
  payload?: unknown;
  [key: string]: unknown;
};

export type CaptureQueryRow = {
  id?: string | number;
  [key: string]: unknown;
};

export type CaptureSessionSummary = {
  sessionId?: string;
  startedAt?: string;
  eventCount?: number;
  [key: string]: unknown;
};
