import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma, UserRole } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import type { DbClient } from "../../utils/transaction";

import type { ReportRepository } from "./report.repository";
import { createReportService } from "./report.service";

const VALID_MOVER_ID = "6f9619ff-8b86-4d11-b42d-00cf4fc964ff";
const VALID_MOVER_ID_UPPERCASE = "6F9619FF-8B86-4D11-B42D-00CF4FC964FF";

function createRepositoryStub(overrides: Partial<ReportRepository> = {}): ReportRepository {
  return {
    findReviewTargetById: async () => null,
    findUserById: async () => null,
    findResidenceReviewTargetById: async () => null,
    findGiveawayTargetById: async () => null,
    findExistingReport: async () => null,
    findMineWithCount: async () => ({ reports: [], totalCount: 0 }),
    createReport: async ({ targetType, targetId, reason, status, detail, imageKeys }) => ({
      id: 1,
      targetType,
      targetId,
      reason,
      status,
      detail,
      images: (imageKeys ?? []).map((imageKey, index) => ({
        id: index + 1,
        imageKey,
      })),
      createdAt: new Date("2026-08-04T00:00:00.000Z"),
    }),
    ...overrides,
  };
}

function createTransactionRunner() {
  const tx = {} as DbClient;

  return {
    run: async <T>(callback: (db: DbClient) => Promise<T>) => callback(tx),
  };
}

function createImageManagerStub() {
  return {
    promoteUploadedImages: async (_userId: string, imageKeys: string[] | undefined) => ({
      tempKeys: imageKeys ?? [],
      finalKeys: imageKeys?.map((key) => key.replace("temp/reports/", "reports/")) ?? [],
    }),
    cleanupTempImages: async (_tempKeys: string[]) => {},
    cleanupFinalImages: async (_finalKeys: string[]) => {},
  };
}

function createService(
  repositoryOverrides: Partial<ReportRepository> = {},
  imageManager = createImageManagerStub(),
) {
  const transaction = createTransactionRunner();

  return createReportService(
    createRepositoryStub(repositoryOverrides),
    imageManager,
    transaction.run,
  );
}

function createUniqueConstraintError(meta: {
  target?: string[] | string;
  modelName?: string;
}): Prisma.PrismaClientKnownRequestError {
  const error = Object.create(
    Prisma.PrismaClientKnownRequestError.prototype,
  ) as Prisma.PrismaClientKnownRequestError;

  Object.assign(error, {
    code: "P2002",
    meta,
  });

  return error;
}

describe("reportService.createReport", () => {
  it("creates a review report with normalized targetId", async () => {
    const service = createService({
      findReviewTargetById: async (reviewId) => ({
        id: reviewId,
        customerId: "customer-2",
        moverId: "mover-1",
      }),
    });

    const result = await service.createReport({
      reporterId: "customer-1",
      reporterRole: UserRole.CUSTOMER,
      input: {
        targetType: "REVIEW",
        targetId: "00123",
        reason: "ABUSE",
        description: "욕설이 포함되어 있습니다.",
      },
    });

    assert.equal(result.targetType, "REVIEW");
    assert.equal(result.targetId, "123");
    assert.equal(result.reason, "ABUSE");
    assert.equal(result.status, "PENDING");
    assert.equal(result.description, "욕설이 포함되어 있습니다.");
    assert.deepEqual(result.images, []);
  });

  it("creates a mover report with normalized UUID casing", async () => {
    const service = createService({
      findUserById: async (userId) => ({
        id: userId,
        role: UserRole.MOVER,
        deletedAt: null,
      }),
    });

    const result = await service.createReport({
      reporterId: "customer-1",
      reporterRole: UserRole.CUSTOMER,
      input: {
        targetType: "MOVER",
        targetId: VALID_MOVER_ID_UPPERCASE,
        reason: "SPAM",
        description: "광고성 응답을 반복합니다.",
      },
    });

    assert.equal(result.targetType, "MOVER");
    assert.equal(result.targetId, VALID_MOVER_ID);
  });

  it("throws REPORT_TARGET_NOT_FOUND for a missing review", async () => {
    const service = createService();

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
          reporterRole: UserRole.CUSTOMER,
          input: {
            targetType: "REVIEW",
            targetId: "123",
            reason: "ABUSE",
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "REPORT_TARGET_NOT_FOUND",
    );
  });

  it("throws REPORT_TARGET_NOT_FOUND for a missing mover", async () => {
    const service = createService();

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
          reporterRole: UserRole.CUSTOMER,
          input: {
            targetType: "MOVER",
            targetId: VALID_MOVER_ID,
            reason: "SPAM",
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "REPORT_TARGET_NOT_FOUND",
    );
  });

  it("throws REPORT_SELF_NOT_ALLOWED when a mover reports themselves", async () => {
    const service = createService();

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: VALID_MOVER_ID,
          reporterRole: UserRole.MOVER,
          input: {
            targetType: "MOVER",
            targetId: VALID_MOVER_ID_UPPERCASE,
            reason: "SPAM",
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "REPORT_SELF_NOT_ALLOWED",
    );
  });

  it("throws REPORT_SELF_NOT_ALLOWED when a review author reports their own review", async () => {
    const service = createService({
      findReviewTargetById: async (reviewId) => ({
        id: reviewId,
        customerId: "customer-1",
        moverId: "mover-1",
      }),
    });

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
          reporterRole: UserRole.CUSTOMER,
          input: {
            targetType: "REVIEW",
            targetId: "123",
            reason: "ABUSE",
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "REPORT_SELF_NOT_ALLOWED",
    );
  });

  it("allows the mover who received the review to report that review", async () => {
    const service = createService({
      findReviewTargetById: async (reviewId) => ({
        id: reviewId,
        customerId: "customer-1",
        moverId: "mover-1",
      }),
    });

    const result = await service.createReport({
      reporterId: "mover-1",
      reporterRole: UserRole.MOVER,
      input: {
        targetType: "REVIEW",
        targetId: "123",
        reason: "FALSE_INFO",
        description: "사실과 다른 리뷰입니다.",
      },
    });

    assert.equal(result.targetType, "REVIEW");
    assert.equal(result.reason, "FALSE_INFO");
  });

  it("throws FORBIDDEN when a mover reports another mover's review", async () => {
    const service = createService({
      findReviewTargetById: async (reviewId) => ({
        id: reviewId,
        customerId: "customer-1",
        moverId: "mover-other",
      }),
    });

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "mover-1",
          reporterRole: UserRole.MOVER,
          input: {
            targetType: "REVIEW",
            targetId: "123",
            reason: "FALSE_INFO",
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
    );
  });

  it("throws FORBIDDEN when a mover reports a giveaway", async () => {
    const service = createService({
      findGiveawayTargetById: async (giveawayId) => ({
        id: giveawayId,
        authorId: "customer-1",
      }),
    });

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "mover-1",
          reporterRole: UserRole.MOVER,
          input: {
            targetType: "GIVEAWAY",
            targetId: "10",
            reason: "SPAM",
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
    );
  });

  it("throws FORBIDDEN when a mover reports a residence review", async () => {
    const service = createService({
      findResidenceReviewTargetById: async (residenceReviewId) => ({
        id: residenceReviewId,
        authorId: "customer-1",
      }),
    });

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "mover-1",
          reporterRole: UserRole.MOVER,
          input: {
            targetType: "RESIDENCE_REVIEW",
            targetId: "10",
            reason: "ABUSE",
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
    );
  });

  it("throws REPORT_ALREADY_EXISTS when a duplicate report is found before create", async () => {
    const service = createService({
      findReviewTargetById: async (reviewId) => ({
        id: reviewId,
        customerId: "customer-2",
        moverId: "mover-1",
      }),
      findExistingReport: async () => ({ id: 9 }),
    });

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
          reporterRole: UserRole.CUSTOMER,
          input: {
            targetType: "REVIEW",
            targetId: "123",
            reason: "ABUSE",
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );
  });

  it("throws REPORT_TARGET_NOT_REPORTABLE when the target user is not a mover", async () => {
    const service = createService({
      findUserById: async (userId) => ({
        id: userId,
        role: UserRole.CUSTOMER,
        deletedAt: null,
      }),
    });

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
          reporterRole: UserRole.CUSTOMER,
          input: {
            targetType: "MOVER",
            targetId: VALID_MOVER_ID,
            reason: "SPAM",
          },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "REPORT_TARGET_NOT_REPORTABLE",
    );
  });

  it("maps a default camelCase P2002 target to REPORT_ALREADY_EXISTS", async () => {
    const service = createService({
      findUserById: async (userId) => ({
        id: userId,
        role: UserRole.MOVER,
        deletedAt: null,
      }),
      createReport: async () => {
        throw createUniqueConstraintError({
          target: ["targetType", "targetId", "reporterId"],
        });
      },
    });

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
          reporterRole: UserRole.CUSTOMER,
          input: {
            targetType: "MOVER",
            targetId: VALID_MOVER_ID,
            reason: "SPAM",
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );
  });

  it("maps a snake_case P2002 target to REPORT_ALREADY_EXISTS", async () => {
    const service = createService({
      findUserById: async (userId) => ({
        id: userId,
        role: UserRole.MOVER,
        deletedAt: null,
      }),
      createReport: async () => {
        throw createUniqueConstraintError({
          target: ["target_type", "target_id", "reporter_id"],
        });
      },
    });

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
          reporterRole: UserRole.CUSTOMER,
          input: {
            targetType: "MOVER",
            targetId: VALID_MOVER_ID,
            reason: "SPAM",
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );
  });

  it("maps a constraint-name P2002 target to REPORT_ALREADY_EXISTS", async () => {
    const service = createService({
      findUserById: async (userId) => ({
        id: userId,
        role: UserRole.MOVER,
        deletedAt: null,
      }),
      createReport: async () => {
        throw createUniqueConstraintError({
          target: "reports_target_type_target_id_reporter_id_key",
        });
      },
    });

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
          reporterRole: UserRole.CUSTOMER,
          input: {
            targetType: "MOVER",
            targetId: VALID_MOVER_ID,
            reason: "SPAM",
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );
  });

  it("maps a partial target to REPORT_ALREADY_EXISTS only when it is clearly the Report model", async () => {
    const service = createService({
      findUserById: async (userId) => ({
        id: userId,
        role: UserRole.MOVER,
        deletedAt: null,
      }),
      createReport: async () => {
        throw createUniqueConstraintError({
          target: ["targetId"],
          modelName: "Report",
        });
      },
    });

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
          reporterRole: UserRole.CUSTOMER,
          input: {
            targetType: "MOVER",
            targetId: VALID_MOVER_ID,
            reason: "SPAM",
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );
  });

  it("rethrows P2002 for a different model even if the target fields look the same", async () => {
    const service = createService({
      findUserById: async (userId) => ({
        id: userId,
        role: UserRole.MOVER,
        deletedAt: null,
      }),
      createReport: async () => {
        throw createUniqueConstraintError({
          target: ["targetType", "targetId", "reporterId"],
          modelName: "OtherModel",
        });
      },
    });

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
          reporterRole: UserRole.CUSTOMER,
          input: {
            targetType: "MOVER",
            targetId: VALID_MOVER_ID,
            reason: "SPAM",
          },
        }),
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );
  });

  it("promotes temp images, stores final keys, and cleans up temp images after creation", async () => {
    const tempKey = "temp/reports/customer-1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
    const finalKey = "reports/customer-1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";

    let receivedUserId: string | undefined;
    let receivedTempKeys: string[] | undefined;
    let receivedCreateImageKeys: string[] | undefined;
    let cleanedTempKeys: string[] = [];
    let cleanedFinalKeys: string[] = [];

    const imageManager = {
      promoteUploadedImages: async (userId: string, imageKeys: string[] | undefined) => {
        receivedUserId = userId;
        receivedTempKeys = imageKeys;

        return {
          tempKeys: imageKeys ?? [],
          finalKeys: imageKeys ? [finalKey] : [],
        };
      },
      cleanupTempImages: async (tempKeys: string[]) => {
        cleanedTempKeys = tempKeys;
      },
      cleanupFinalImages: async (finalKeys: string[]) => {
        cleanedFinalKeys = finalKeys;
      },
    };

    const service = createService(
      {
        findUserById: async (userId) => ({
          id: userId,
          role: UserRole.MOVER,
          deletedAt: null,
        }),
        createReport: async ({ targetType, targetId, reason, status, detail, imageKeys }) => {
          receivedCreateImageKeys = imageKeys;

          return {
            id: 1,
            targetType,
            targetId,
            reason,
            status,
            detail,
            images: (imageKeys ?? []).map((imageKey, index) => ({
              id: index + 1,
              imageKey,
            })),
            createdAt: new Date("2026-08-04T00:00:00.000Z"),
          };
        },
      },
      imageManager,
    );

    const result = await service.createReport({
      reporterId: "customer-1",
      reporterRole: UserRole.CUSTOMER,
      input: {
        targetType: "MOVER",
        targetId: VALID_MOVER_ID,
        reason: "SPAM",
        imageKeys: [tempKey],
      },
    });

    assert.equal(receivedUserId, "customer-1");
    assert.deepEqual(receivedTempKeys, [tempKey]);
    assert.deepEqual(receivedCreateImageKeys, [finalKey]);
    assert.deepEqual(cleanedTempKeys, [tempKey]);
    assert.deepEqual(cleanedFinalKeys, []);
    assert.equal(result.images.length, 1);
  });

  it("cleans up promoted final images when report creation fails", async () => {
    const tempKey = "temp/reports/customer-1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
    const finalKey = "reports/customer-1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";

    let cleanedTempKeys: string[] = [];
    let cleanedFinalKeys: string[] = [];

    const imageManager = {
      promoteUploadedImages: async () => ({
        tempKeys: [tempKey],
        finalKeys: [finalKey],
      }),
      cleanupTempImages: async (tempKeys: string[]) => {
        cleanedTempKeys = tempKeys;
      },
      cleanupFinalImages: async (finalKeys: string[]) => {
        cleanedFinalKeys = finalKeys;
      },
    };

    const service = createService(
      {
        findUserById: async (userId) => ({
          id: userId,
          role: UserRole.MOVER,
          deletedAt: null,
        }),
        createReport: async () => {
          throw new AppError("INTERNAL_SERVER_ERROR");
        },
      },
      imageManager,
    );

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
          reporterRole: UserRole.CUSTOMER,
          input: {
            targetType: "MOVER",
            targetId: VALID_MOVER_ID,
            reason: "SPAM",
            imageKeys: [tempKey],
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "INTERNAL_SERVER_ERROR",
    );

    assert.deepEqual(cleanedTempKeys, []);
    assert.deepEqual(cleanedFinalKeys, [finalKey]);
  });

  it("maps a report unique constraint error after cleaning up promoted final images", async () => {
    const tempKey = "temp/reports/customer-1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
    const finalKey = "reports/customer-1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";

    let cleanedFinalKeys: string[] = [];

    const imageManager = {
      promoteUploadedImages: async () => ({
        tempKeys: [tempKey],
        finalKeys: [finalKey],
      }),
      cleanupTempImages: async (_tempKeys: string[]) => {},
      cleanupFinalImages: async (finalKeys: string[]) => {
        cleanedFinalKeys = finalKeys;
      },
    };

    const service = createService(
      {
        findUserById: async (userId) => ({
          id: userId,
          role: UserRole.MOVER,
          deletedAt: null,
        }),
        createReport: async () => {
          throw createUniqueConstraintError({
            target: ["targetType", "targetId", "reporterId"],
          });
        },
      },
      imageManager,
    );

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
          reporterRole: UserRole.CUSTOMER,
          input: {
            targetType: "MOVER",
            targetId: VALID_MOVER_ID,
            reason: "SPAM",
            imageKeys: [tempKey],
          },
        }),
      (error: unknown) => error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );

    assert.deepEqual(cleanedFinalKeys, [finalKey]);
  });
});

describe("reportService.getMyReports", () => {
  it("queries only the current reporter and returns pagination", async () => {
    const createdAt = new Date("2026-08-21T00:00:00.000Z");
    const handledAt = new Date("2026-08-21T01:00:00.000Z");

    let receivedParams:
      | {
          reporterId: string;
          skip: number;
          take: number;
        }
      | undefined;

    const service = createService({
      findMineWithCount: async (params) => {
        receivedParams = params;

        return {
          reports: [
            {
              id: 7,
              targetType: "MOVER",
              targetId: VALID_MOVER_ID,
              reason: "SPAM",
              status: "RESOLVED",
              detail: "광고성 응답을 반복합니다.",
              images: [],
              handledAt,
              createdAt,
            },
          ],
          totalCount: 21,
        };
      },
    });

    const result = await service.getMyReports({
      reporterId: "customer-1",
      query: {
        page: 2,
        limit: 10,
      },
    });

    assert.deepEqual(receivedParams, {
      reporterId: "customer-1",
      skip: 10,
      take: 10,
    });

    assert.deepEqual(result.reports, [
      {
        id: 7,
        targetType: "MOVER",
        targetId: VALID_MOVER_ID,
        reason: "SPAM",
        status: "RESOLVED",
        description: "광고성 응답을 반복합니다.",
        images: [],
        handledAt,
        createdAt,
      },
    ]);

    assert.deepEqual(result.pagination, {
      page: 2,
      limit: 10,
      totalCount: 21,
      totalPages: 3,
      hasNext: true,
    });
  });

  it("returns an empty list with pagination when there are no reports", async () => {
    const service = createService({
      findMineWithCount: async () => ({
        reports: [],
        totalCount: 0,
      }),
    });

    const result = await service.getMyReports({
      reporterId: "customer-1",
      query: {
        page: 1,
        limit: 10,
      },
    });

    assert.deepEqual(result.reports, []);
    assert.deepEqual(result.pagination, {
      page: 1,
      limit: 10,
      totalCount: 0,
      totalPages: 0,
      hasNext: false,
    });
  });
});

describe("reportService.getMyReports", () => {
  it("returns attached images with public URLs", async () => {
    const createdAt = new Date("2026-08-22T00:00:00.000Z");

    const service = createService({
      findMineWithCount: async () => ({
        reports: [
          {
            id: 1,
            targetType: "MOVER",
            targetId: VALID_MOVER_ID,
            reason: "SPAM",
            status: "PENDING",
            detail: "신고 내용",
            images: [
              {
                id: 10,
                imageKey: "reports/customer-1/test.jpg",
              },
            ],
            handledAt: null,
            createdAt,
          },
        ],
        totalCount: 1,
      }),
    });

    const result = await service.getMyReports({
      reporterId: "customer-1",
      query: {
        page: 1,
        limit: 10,
      },
    });

    assert.equal(result.reports.length, 1);

    assert.equal(result.reports[0]?.images.length, 1);

    assert.equal(result.reports[0]?.images[0]?.id, 10);

    assert.ok(result.reports[0]?.images[0]?.imageUrl);
  });
});
