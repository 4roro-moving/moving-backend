import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RefreshTokenSessionType } from "@prisma/client";

import type { DbClient } from "../../utils/transaction";
import { authRepository } from "./auth.repository";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

const FIXED_NOW = new Date("2026-08-13T04:00:00.000Z");
const CUTOFF = new Date(FIXED_NOW.getTime() - RETENTION_DAYS * DAY_MS);

type RefreshTokenRecord = {
  id: number;
  expiresAt: Date;
  revokedAt: Date | null;
  sessionType: RefreshTokenSessionType;
};

type DeleteManyArgs = {
  where: {
    expiresAt: {
      lt: Date;
    };
  };
};

function createMockDb(tokens: RefreshTokenRecord[]) {
  const deleteManyCalls: DeleteManyArgs[] = [];

  const db = {
    refreshToken: {
      deleteMany: async (args: DeleteManyArgs) => {
        deleteManyCalls.push(args);

        const cutoff = args.where.expiresAt.lt;
        const deletedCount = tokens.filter((token) => token.expiresAt < cutoff).length;

        return { count: deletedCount };
      },
    },
  } as unknown as DbClient;

  return { db, deleteManyCalls };
}

function createToken(
  overrides: Partial<RefreshTokenRecord> & Pick<RefreshTokenRecord, "expiresAt">,
): RefreshTokenRecord {
  return {
    id: 1,
    revokedAt: null,
    sessionType: RefreshTokenSessionType.USER,
    ...overrides,
  };
}

describe("authRepository.deleteRefreshTokensExpiredBefore", () => {
  it("queries only by expiresAt lt cutoff without revokedAt or sessionType filters", async () => {
    const { db, deleteManyCalls } = createMockDb([]);

    await authRepository.deleteRefreshTokensExpiredBefore(CUTOFF, db);

    assert.equal(deleteManyCalls.length, 1);
    assert.deepEqual(deleteManyCalls[0], {
      where: {
        expiresAt: {
          lt: CUTOFF,
        },
      },
    });
    assert.equal("revokedAt" in deleteManyCalls[0].where, false);
    assert.equal("sessionType" in deleteManyCalls[0].where, false);
  });

  it("deletes refresh tokens whose expiresAt is before cutoff", async () => {
    const token = createToken({
      id: 1,
      expiresAt: new Date(CUTOFF.getTime() - DAY_MS),
    });
    const { db } = createMockDb([token]);

    const result = await authRepository.deleteRefreshTokensExpiredBefore(CUTOFF, db);

    assert.equal(result.count, 1);
  });

  it("does not delete refresh tokens whose expiresAt is within the 30-day retention window", async () => {
    const token = createToken({
      id: 1,
      expiresAt: new Date(FIXED_NOW.getTime() - 10 * DAY_MS),
    });
    const { db } = createMockDb([token]);

    const result = await authRepository.deleteRefreshTokensExpiredBefore(CUTOFF, db);

    assert.equal(result.count, 0);
  });

  it("does not delete revoked tokens while expiresAt is still within the retention window", async () => {
    const token = createToken({
      id: 1,
      expiresAt: new Date(FIXED_NOW.getTime() - 10 * DAY_MS),
      revokedAt: new Date(FIXED_NOW.getTime() - 5 * DAY_MS),
    });
    const { db } = createMockDb([token]);

    const result = await authRepository.deleteRefreshTokensExpiredBefore(CUTOFF, db);

    assert.equal(result.count, 0);
  });

  it("deletes revoked tokens when expiresAt is before cutoff", async () => {
    const token = createToken({
      id: 1,
      expiresAt: new Date(CUTOFF.getTime() - DAY_MS),
      revokedAt: new Date(FIXED_NOW.getTime() - 20 * DAY_MS),
    });
    const { db } = createMockDb([token]);

    const result = await authRepository.deleteRefreshTokensExpiredBefore(CUTOFF, db);

    assert.equal(result.count, 1);
  });

  it("deletes USER refresh tokens that satisfy the expiresAt lt cutoff condition", async () => {
    const token = createToken({
      id: 1,
      sessionType: RefreshTokenSessionType.USER,
      expiresAt: new Date(CUTOFF.getTime() - 1),
    });
    const { db } = createMockDb([token]);

    const result = await authRepository.deleteRefreshTokensExpiredBefore(CUTOFF, db);

    assert.equal(result.count, 1);
  });

  it("deletes ADMIN refresh tokens that satisfy the expiresAt lt cutoff condition", async () => {
    const token = createToken({
      id: 1,
      sessionType: RefreshTokenSessionType.ADMIN,
      expiresAt: new Date(CUTOFF.getTime() - 1),
    });
    const { db } = createMockDb([token]);

    const result = await authRepository.deleteRefreshTokensExpiredBefore(CUTOFF, db);

    assert.equal(result.count, 1);
  });

  it("uses lt so expiresAt before cutoff is deleted but expiresAt equal to cutoff is kept", async () => {
    const deletableToken = createToken({
      id: 1,
      expiresAt: new Date(CUTOFF.getTime() - 1),
    });
    const boundaryToken = createToken({
      id: 2,
      expiresAt: new Date(CUTOFF.getTime()),
    });
    const { db } = createMockDb([deletableToken, boundaryToken]);

    const result = await authRepository.deleteRefreshTokensExpiredBefore(CUTOFF, db);

    assert.equal(result.count, 1);
  });
});
