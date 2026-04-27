import { describe, expect, it } from "vitest";
import { parseAssetRouterJsonObject } from "./asset-router-json.js";

describe("parseAssetRouterJsonObject", () => {
  it("parses a bare JSON object", () => {
    expect(parseAssetRouterJsonObject('{"needsAssets":true,"searchQueries":["docs"]}')).toEqual({
      needsAssets: true,
      searchQueries: ["docs"],
    });
  });

  it("parses JSON from a fenced block with surrounding text", () => {
    expect(
      parseAssetRouterJsonObject(
        [
          "Here is the routing decision:",
          "```json",
          '{"needsAssets":true,"confidence":0.8,"reason":"use docs"}',
          "```",
          "Done.",
        ].join("\n"),
      ),
    ).toEqual({
      needsAssets: true,
      confidence: 0.8,
      reason: "use docs",
    });
  });

  it("uses the first valid object instead of slicing through multiple objects", () => {
    expect(
      parseAssetRouterJsonObject(
        '{"needsAssets":true,"searchQueries":["memory"]}\n{"debug":"ignored"}',
      ),
    ).toEqual({
      needsAssets: true,
      searchQueries: ["memory"],
    });
  });

  it("handles braces inside JSON strings", () => {
    expect(
      parseAssetRouterJsonObject('prefix {"reason":"contains { and }","needsAssets":false} suffix'),
    ).toEqual({
      reason: "contains { and }",
      needsAssets: false,
    });
  });

  it("falls through invalid candidates until a valid object is found", () => {
    expect(parseAssetRouterJsonObject('bad {not json} then {"needsAssets":false}')).toEqual({
      needsAssets: false,
    });
  });
});
