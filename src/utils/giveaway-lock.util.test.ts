import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Prisma } from "@prisma/client";

import { lockGiveawayForUpdate } from "./giveaway-lock.util";

describe("lockGiveawayForUpdate", () => {
  it("행이 없으면 false를 반환한다", async () => {
    const db = {
      $queryRaw: async () => [],
    } as unknown as Prisma.TransactionClient;

    assert.equal(await lockGiveawayForUpdate(db, 999), false);
  });

  it("행이 있으면 true를 반환한다", async () => {
    const db = {
      $queryRaw: async () => [{ id: 1 }],
    } as unknown as Prisma.TransactionClient;

    assert.equal(await lockGiveawayForUpdate(db, 1), true);
  });
});
