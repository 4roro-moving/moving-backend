import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma, UserRole } from "@prisma/client";

import { AppError } from "../../lib/app-error";

import type { ReportRepository } from "./report.repository";
import { createReportService } from "./report.service";

const VALID_MOVER_ID = "6f9619ff-8b86-4d11-b42d-00cf4fc964ff";
const VALID_MOVER_ID_UPPERCASE = "6F9619FF-8B86-4D11-B42D-00CF4FC964FF";

function createRepositoryStub(overrides: Partial<ReportRepository> = {}): ReportRepository {
  return {
    findReviewTargetById: async () => null,
    findUserById: async () => null,
    findExistingReport: async () => null,
    createReport: async ({ targetType, targetId, reason, status, detail }) => ({
      id: 1,
      targetType,
      targetId,
      reason,
      status,
      detail,
      createdAt: new Date("2026-08-04T00:00:00.000Z"),
    }),
    ...overrides,
  };
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
    const service = createReportService(
      createRepositoryStub({
        findReviewTargetById: async (reviewId) => ({
          id: reviewId,
          customerId: "customer-2",
          moverId: "mover-1",
        }),
      }),
    );

    const result = await service.createReport({
      reporterId: "customer-1",
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
  });

  it("creates a mover report with normalized UUID casing", async () => {
    const service = createReportService(
      createRepositoryStub({
        findUserById: async (userId) => ({
          id: userId,
          role: UserRole.MOVER,
          deletedAt: null,
        }),
      }),
    );

    const result = await service.createReport({
      reporterId: "customer-1",
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
    const service = createReportService(createRepositoryStub());

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
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
    const service = createReportService(createRepositoryStub());

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
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
    const service = createReportService(createRepositoryStub());

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: VALID_MOVER_ID,
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
    const service = createReportService(
      createRepositoryStub({
        findReviewTargetById: async (reviewId) => ({
          id: reviewId,
          customerId: "customer-1",
          moverId: "mover-1",
        }),
      }),
    );

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
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
    const service = createReportService(
      createRepositoryStub({
        findReviewTargetById: async (reviewId) => ({
          id: reviewId,
          customerId: "customer-1",
          moverId: "mover-1",
        }),
      }),
    );

    const result = await service.createReport({
      reporterId: "mover-1",
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

  it("throws REPORT_ALREADY_EXISTS when a duplicate report is found before create", async () => {
    const service = createReportService(
      createRepositoryStub({
        findReviewTargetById: async (reviewId) => ({
          id: reviewId,
          customerId: "customer-2",
          moverId: "mover-1",
        }),
        findExistingReport: async () => ({ id: 9 }),
      }),
    );

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
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
    const service = createReportService(
      createRepositoryStub({
        findUserById: async (userId) => ({
          id: userId,
          role: UserRole.CUSTOMER,
          deletedAt: null,
        }),
      }),
    );

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
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
    const service = createReportService(
      createRepositoryStub({
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
      }),
    );

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
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
    const service = createReportService(
      createRepositoryStub({
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
      }),
    );

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
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
    const service = createReportService(
      createRepositoryStub({
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
      }),
    );

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
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
    const service = createReportService(
      createRepositoryStub({
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
      }),
    );

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
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
    const service = createReportService(
      createRepositoryStub({
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
      }),
    );

    await assert.rejects(
      () =>
        service.createReport({
          reporterId: "customer-1",
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
});
