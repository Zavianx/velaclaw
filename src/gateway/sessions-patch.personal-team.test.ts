import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import type { VelaclawConfig } from "../config/types.velaclaw.js";
import { applySessionsPatchToStore } from "./sessions-patch.js";

const cfg = {} as VelaclawConfig;

describe("sessions.patch personal team subagent tool policy", () => {
  it("persists read-only policy for subagent sessions", async () => {
    const store: Record<string, SessionEntry> = {};
    const storeKey = "agent:main:subagent:helper";

    const result = await applySessionsPatchToStore({
      cfg,
      store,
      storeKey,
      patch: {
        key: storeKey,
        subagentToolPolicy: "read_only",
      },
    });

    expect(result.ok).toBe(true);
    expect(store[storeKey]?.subagentToolPolicy).toBe("read_only");
  });

  it("rejects read-only policy on non-subagent sessions", async () => {
    const store: Record<string, SessionEntry> = {};
    const storeKey = "agent:main:main";

    const result = await applySessionsPatchToStore({
      cfg,
      store,
      storeKey,
      patch: {
        key: storeKey,
        subagentToolPolicy: "read_only",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.message).toContain("only supported");
  });

  it("does not clear read-only policy once set", async () => {
    const storeKey = "agent:main:subagent:helper";
    const store: Record<string, SessionEntry> = {
      [storeKey]: {
        sessionId: storeKey,
        updatedAt: Date.now(),
        subagentToolPolicy: "read_only",
      },
    };

    const result = await applySessionsPatchToStore({
      cfg,
      store,
      storeKey,
      patch: {
        key: storeKey,
        subagentToolPolicy: null,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.message).toContain("cannot be cleared");
  });
});
