import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SERVER_SOURCE = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "server.ts"),
  "utf8",
);

describe("server refresh token cleanup registration", () => {
  it("imports and starts the refresh token cleanup job during bootstrap", () => {
    assert.match(
      SERVER_SOURCE,
      /import\s+\{\s*startRefreshTokenCleanupJob\s*\}\s+from\s+"\.\/jobs\/refresh-token-cleanup\.job";/,
    );
    assert.match(SERVER_SOURCE, /startRefreshTokenCleanupJob\(\);/);
  });
});
