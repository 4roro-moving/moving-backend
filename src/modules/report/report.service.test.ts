import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma, UserRole } from "@prisma/client";

import { AppError } from "../../lib/app-error";

import { createReportService } from "./report.service";
import type { ReportRepository } from "./report.repository";

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
      target: ["target_type", "target_id", "reporter_id"],
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
        targetId: "6F9619FF-8B86-D011-B42D-00CF4FC964FF",
        reason: "SPAM",
        description: "광고성 응답을 반복합니다.",
      },
    });

    assert.equal(result.targetType, "MOVER");
    assert.equal(result.targetId, "6f9619ff-8b86-d011-b42d-00cf4fc964ff");
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
            targetId: "6f9619ff-8b86-d011-b42d-00cf4fc964ff",
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
          reporterId: "6f9619ff-8b86-d011-b42d-00cf4fc964ff",
          input: {
            targetType: "MOVER",
            targetId: "6F9619FF-8B86-D011-B42D-00CF4FC964FF",
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
            targetId: "6f9619ff-8b86-d011-b42d-00cf4fc964ff",
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
            targetId: "6f9619ff-8b86-d011-b42d-00cf4fc964ff",
            reason: "SPAM",
          },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "REPORT_ALREADY_EXISTS",
    );
  });
});
