import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma, UserRole } from "@prisma/client";

import { AppError } from "../../lib/app-error";

import { createReportService } from "./report.service";
import type { ReportRepository } from "./report.repository";

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

function createUniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  const error = Object.create(
    Prisma.PrismaClientKnownRequestError.prototype,
  ) as Prisma.PrismaClientKnownRequestError;

  Object.assign(error, {
    code: "P2002",
    meta: {
      target: ["targetType", "targetId", "reporterId"],
    },
  });

  return error;
}

function createUniqueConstraintErrorWithTarget(
  target: string[] | string | undefined,
  modelName?: string,
): Prisma.PrismaClientKnownRequestError {
  const error = Object.create(
    Prisma.PrismaClientKnownRequestError.prototype,
  ) as Prisma.PrismaClientKnownRequestError;

  Object.assign(error, {
    code: "P2002",
    meta: {
      ...(target !== undefined && { target }),
      ...(modelName !== undefined && { modelName }),
    },
  });

  return error;
}

describe("reportService.createReport", () => {
  it("리뷰 신고 성공", async () => {
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

  it("기사 신고 성공", async () => {
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

  it("존재하지 않는 리뷰면 REPORT_TARGET_NOT_FOUND", async () => {
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
      (error: unknown) =>
        error instanceof AppError && error.code === "REPORT_TARGET_NOT_FOUND",
    );
  });

  it("존재하지 않는 기사면 REPORT_TARGET_NOT_FOUND", async () => {
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
      (error: unknown) =>
        error instanceof AppError && error.code === "REPORT_TARGET_NOT_FOUND",
    );
  });

  it("자기 자신 기사 신고는 REPORT_SELF_NOT_ALLOWED", async () => {
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
      (error: unknown) =>
        error instanceof AppError && error.code === "REPORT_SELF_NOT_ALLOWED",
    );
  });

  it("리뷰 작성자의 자기 리뷰 신고는 REPORT_SELF_NOT_ALLOWED", async () => {
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
      (error: unknown) =>
        error instanceof AppError && error.code === "REPORT_SELF_NOT_ALLOWED",
    );
  });

  it("리뷰 대상 기사의 해당 리뷰 신고는 성공", async () => {
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

  it("중복 신고는 REPORT_ALREADY_EXISTS", async () => {
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
      (error: unknown) =>
        error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );
  });

  it("신고 가능한 대상이 아닌 사용자면 REPORT_TARGET_NOT_REPORTABLE", async () => {
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

  it("P2002 발생 시 REPORT_ALREADY_EXISTS로 변환", async () => {
    const service = createReportService(
      createRepositoryStub({
        findUserById: async (userId) => ({
          id: userId,
          role: UserRole.MOVER,
          deletedAt: null,
        }),
        createReport: async () => {
          throw createUniqueConstraintError();
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
        error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );
  });

  it("P2002 camelCase target도 REPORT_ALREADY_EXISTS로 변환", async () => {
    const service = createReportService(
      createRepositoryStub({
        findUserById: async (userId) => ({
          id: userId,
          role: UserRole.MOVER,
          deletedAt: null,
        }),
        createReport: async () => {
          throw createUniqueConstraintErrorWithTarget(["targetType", "targetId", "reporterId"]);
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
        error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );
  });

  it("P2002 snake_case target도 REPORT_ALREADY_EXISTS로 변환", async () => {
    const service = createReportService(
      createRepositoryStub({
        findUserById: async (userId) => ({
          id: userId,
          role: UserRole.MOVER,
          deletedAt: null,
        }),
        createReport: async () => {
          throw createUniqueConstraintErrorWithTarget(["target_type", "target_id", "reporter_id"]);
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
        error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );
  });

  it("P2002 constraint name string도 REPORT_ALREADY_EXISTS로 변환", async () => {
    const service = createReportService(
      createRepositoryStub({
        findUserById: async (userId) => ({
          id: userId,
          role: UserRole.MOVER,
          deletedAt: null,
        }),
        createReport: async () => {
          throw createUniqueConstraintErrorWithTarget(
            "reports_target_type_target_id_reporter_id_key",
          );
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
        error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );
  });

  it("target 정보가 불완전해도 Report 모델 P2002면 REPORT_ALREADY_EXISTS로 변환", async () => {
    const service = createReportService(
      createRepositoryStub({
        findUserById: async (userId) => ({
          id: userId,
          role: UserRole.MOVER,
          deletedAt: null,
        }),
        createReport: async () => {
          throw createUniqueConstraintErrorWithTarget(["targetId"], "Report");
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
        error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );
  });

  it("무관한 P2002는 원본 에러를 유지", async () => {
    const service = createReportService(
      createRepositoryStub({
        findUserById: async (userId) => ({
          id: userId,
          role: UserRole.MOVER,
          deletedAt: null,
        }),
        createReport: async () => {
          throw createUniqueConstraintErrorWithTarget(["someOtherField"], "OtherModel");
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
