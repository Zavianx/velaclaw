import type { VelaclawConfig } from "../../config/types.js";

export type DirectoryConfigParams = {
  cfg: VelaclawConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
};
