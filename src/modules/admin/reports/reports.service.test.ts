import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GiveawayStatus,
  LogAction,
  LogTargetType,
  ReportReason,
  ReportStatus,
  ReportTargetType,
  UserRole,
} from "@prisma/client";
import type { NotificationType } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import type { DbClient } from "../../../utils/transaction";

import type { AdminReportDetailRow, AdminReportRow } from "./reports.repository";
import { createReportsService, type ReportsRepository } from "./reports.service";

const CREATED_AT = new Date("2026-08-15T00:00:00.000Z");
const UPDATED_AT = new Date("2026-08-15T00:10:00.000Z");

const REPORTER_ID = "11111111-1111-4111-8111-111111111111";
const MOVER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";

function createReportRow(overrides: Partial<AdminReportRow> = {}): AdminReportRow {
  return {
    id: 1,
    targetType: ReportTargetType.REVIEW,
    targetId: "10",
    reporterId: REPORTER_ID,
    reason: ReportReason.ABUSE,
    detail: "부적절한 리뷰입니다.",
    status: ReportStatus.PENDING,
    handledBy: null,
    handledAt: null,
    handlerNote: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    reporter: {
      id: REPORTER_ID,
      name: "신고자",
      email: "reporter@example.com",
      role: UserRole.CUSTOMER,
    },
    handler: null,
    ...overrides,
  };
}

function createReportDetailRow(
  overrides: Partial<AdminReportDetailRow> = {},
): AdminReportDetailRow {
  return {
    ...createReportRow(),
    images: [],
    ...overrides,
  };
}

function createRepositoryStub(overrides: Partial<ReportsRepository> = {}): ReportsRepository {
  return {
    findReportsWithCount: async () => ({
      reports: [],
      totalCount: 0,
    }),
    findReportById: async () => null,
    updateReportIfPending: async () => null,
    findReviewTargetById: async () => null,
    findMoverTargetById: async () => null,
    findResidenceReviewTargetById: async () => null,
    findGiveawayTargetById: async () => null,
    createActivityLog: async (input) => ({
      id: 1,
      action: LogAction.UPDATE,
      targetType: LogTargetType.REPORT,
      targetId: input.targetId,
      memo: input.memo,
      createdAt: CREATED_AT,
      actor: {
        id: input.actorId,
        name: "관리자",
      },
    }),
    ...overrides,
  };
}

function createTransactionRunner() {
  const tx = {} as DbClient;

  return {
    tx,
    run: async <T>(callback: (client: DbClient) => Promise<T>): Promise<T> => callback(tx),
  };
}

function createNotificationServiceStub() {
  return {
    createNotification: async (input: {
      type: NotificationType;
      title: string;
      content: string;
      linkUrl?: string | null;
      expiresAt: Date | null;
    }) => ({
      id: 1,
      type: input.type,
      title: input.title,
      content: input.content,
      linkUrl: input.linkUrl ?? null,
      isRead: false,
      readAt: null,
      expiresAt: input.expiresAt,
      createdAt: CREATED_AT,
    }),
    sendNotification: (_userId: string, _notification: unknown) => {},
  };
}

function assertAppError(code: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof AppError && error.code === code;
}

describe("reportsService.getReportList", () => {
  it("목록 필터와 페이지네이션 값을 repository에 전달한다", async () => {
    let receivedParams: Parameters<ReportsRepository["findReportsWithCount"]>[0] | undefined;
    const report = createReportRow();

    const repository = createRepositoryStub({
      findReportsWithCount: async (params) => {
        receivedParams = params;

        return {
          reports: [report],
          totalCount: 21,
        };
      },
    });

    const service = createReportsService(repository);

    const result = await service.getReportList({
      page: 2,
      limit: 10,
      status: ReportStatus.PENDING,
      targetType: ReportTargetType.REVIEW,
      reason: ReportReason.ABUSE,
      keyword: "신고",
      sort: "OLDEST",
    });

    assert.deepEqual(receivedParams, {
      skip: 10,
      take: 10,
      filters: {
        status: ReportStatus.PENDING,
        targetType: ReportTargetType.REVIEW,
        reason: ReportReason.ABUSE,
        keyword: "신고",
      },
      sort: "OLDEST",
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.id, report.id);
    assert.deepEqual(result.pagination, {
      page: 2,
      limit: 10,
      totalCount: 21,
      totalPages: 3,
      hasNext: true,
    });
  });
});

describe("reportsService.getReportDetail", () => {
  it("신고가 없으면 NOT_FOUND를 반환한다", async () => {
    const service = createReportsService(createRepositoryStub());

    await assert.rejects(() => service.getReportDetail(999), assertAppError("NOT_FOUND"));
  });

  it("REVIEW 신고 대상 상세를 매핑하고 첨부 이미지도 반환한다", async () => {
    const report = createReportDetailRow({
      targetType: ReportTargetType.REVIEW,
      targetId: "10",
      images: [
        {
          id: 1,
          imageKey: "reports/u1/evidence.jpg",
        },
      ],
    });

    const service = createReportsService(
      createRepositoryStub({
        findReportById: async () => report,
        findReviewTargetById: async () => ({
          id: 10,
          rating: 1,
          content: "문제가 있는 리뷰",
          isHidden: false,
          createdAt: CREATED_AT,
          customer: {
            id: REPORTER_ID,
            name: "작성자",
            email: "author@example.com",
          },
          mover: {
            id: MOVER_ID,
            name: "기사",
            moverProfile: {
              nickname: "무빙기사",
            },
          },
        }),
      }),
    );

    const result = await service.getReportDetail(1);

    assert.equal(result.target?.type, "REVIEW");

    if (result.target?.type !== "REVIEW") {
      assert.fail("REVIEW target이 반환되어야 합니다.");
    }

    assert.equal(result.target.id, 10);
    assert.equal(result.target.content, "문제가 있는 리뷰");
    assert.equal(result.target.mover.nickname, "무빙기사");
    assert.equal(result.images.length, 1);
  });

  it("MOVER 신고 대상 상세를 매핑한다", async () => {
    const report = createReportDetailRow({
      targetType: ReportTargetType.MOVER,
      targetId: MOVER_ID,
    });

    const service = createReportsService(
      createRepositoryStub({
        findReportById: async () => report,
        findMoverTargetById: async () => ({
          id: MOVER_ID,
          name: "기사",
          email: "mover@example.com",
          isActive: true,
          moverProfile: {
            nickname: "무빙기사",
          },
        }),
      }),
    );

    const result = await service.getReportDetail(1);

    assert.equal(result.target?.type, "MOVER");

    if (result.target?.type !== "MOVER") {
      assert.fail("MOVER target이 반환되어야 합니다.");
    }

    assert.equal(result.target.id, MOVER_ID);
    assert.equal(result.target.nickname, "무빙기사");
    assert.equal(result.target.isActive, true);
  });

  it("RESIDENCE_REVIEW 신고 대상 상세를 매핑한다", async () => {
    const report = createReportDetailRow({
      targetType: ReportTargetType.RESIDENCE_REVIEW,
      targetId: "20",
    });

    const service = createReportsService(
      createRepositoryStub({
        findReportById: async () => report,
        findResidenceReviewTargetById: async () => ({
          id: 20,
          title: "부평 거주 후기",
          content: "거주 후기 내용",
          rating: 4,
          isHidden: false,
          createdAt: CREATED_AT,
          author: {
            id: REPORTER_ID,
            name: "작성자",
            email: "author@example.com",
          },
          region: {
            id: 1,
            name: "인천",
          },
        }),
      }),
    );

    const result = await service.getReportDetail(1);

    assert.equal(result.target?.type, "RESIDENCE_REVIEW");

    if (result.target?.type !== "RESIDENCE_REVIEW") {
      assert.fail("RESIDENCE_REVIEW target이 반환되어야 합니다.");
    }

    assert.equal(result.target.id, 20);
    assert.equal(result.target.region.name, "인천");
  });

  it("GIVEAWAY 신고 대상 상세를 매핑한다", async () => {
    const report = createReportDetailRow({
      targetType: ReportTargetType.GIVEAWAY,
      targetId: "30",
    });

    const service = createReportsService(
      createRepositoryStub({
        findReportById: async () => report,
        findGiveawayTargetById: async () => ({
          id: 30,
          title: "무료 나눔",
          description: "나눔 글 내용",
          status: GiveawayStatus.AVAILABLE,
          isHidden: false,
          createdAt: CREATED_AT,
          author: {
            id: REPORTER_ID,
            name: "작성자",
            email: "author@example.com",
          },
          region: {
            id: 1,
            name: "인천",
          },
          images: [
            {
              id: 1,
              imageKey: "giveaways/test.jpg",
              sortOrder: 0,
            },
          ],
        }),
      }),
    );

    const result = await service.getReportDetail(1);

    assert.equal(result.target?.type, "GIVEAWAY");

    if (result.target?.type !== "GIVEAWAY") {
      assert.fail("GIVEAWAY target이 반환되어야 합니다.");
    }

    assert.equal(result.target.id, 30);
    assert.equal(result.target.images.length, 1);
    assert.equal(result.target.images[0]?.imageKey, "giveaways/test.jpg");
  });

  it("신고 원본 대상이 삭제되었으면 target을 null로 반환한다", async () => {
    const report = createReportDetailRow();

    const service = createReportsService(
      createRepositoryStub({
        findReportById: async () => report,
        findReviewTargetById: async () => null,
      }),
    );

    const result = await service.getReportDetail(1);

    assert.equal(result.target, null);
  });

  it("REVIEW targetId가 숫자가 아니면 신고 상세는 유지하고 target만 null로 반환한다", async () => {
    const report = createReportDetailRow({
      targetType: ReportTargetType.REVIEW,
      targetId: "abc",
    });

    let reviewLookupCalled = false;

    const service = createReportsService(
      createRepositoryStub({
        findReportById: async () => report,
        findReviewTargetById: async () => {
          reviewLookupCalled = true;
          return null;
        },
      }),
    );

    const result = await service.getReportDetail(1);

    assert.equal(result.id, report.id);
    assert.equal(result.target, null);
    assert.equal(reviewLookupCalled, false);
  });

  it("양의 정수가 아닌 numeric targetId는 repository 조회 없이 target null로 처리한다", async () => {
    const invalidCases = [
      { targetType: ReportTargetType.REVIEW, targetId: "0" },
      { targetType: ReportTargetType.RESIDENCE_REVIEW, targetId: "-1" },
      { targetType: ReportTargetType.GIVEAWAY, targetId: "1.5" },
    ] as const;

    for (const invalidCase of invalidCases) {
      let lookupCalled = false;

      const service = createReportsService(
        createRepositoryStub({
          findReportById: async () =>
            createReportDetailRow({
              targetType: invalidCase.targetType,
              targetId: invalidCase.targetId,
            }),
          findReviewTargetById: async () => {
            lookupCalled = true;
            return null;
          },
          findResidenceReviewTargetById: async () => {
            lookupCalled = true;
            return null;
          },
          findGiveawayTargetById: async () => {
            lookupCalled = true;
            return null;
          },
        }),
      );

      const result = await service.getReportDetail(1);

      assert.equal(result.target, null);
      assert.equal(
        lookupCalled,
        false,
        `${invalidCase.targetType} target lookup should not be called for ${invalidCase.targetId}`,
      );
    }
  });

  it("존재하지 않는 MOVER UUID는 target null을 반환한다", async () => {
    const report = createReportDetailRow({
      targetType: ReportTargetType.MOVER,
      targetId: MOVER_ID,
    });

    const service = createReportsService(
      createRepositoryStub({
        findReportById: async () => report,
        findMoverTargetById: async () => null,
      }),
    );

    const result = await service.getReportDetail(1);

    assert.equal(result.id, report.id);
    assert.equal(result.target, null);
  });

  it("MOVER targetId가 malformed UUID여도 신고 상세는 유지하고 target만 null로 반환한다", async () => {
    const report = createReportDetailRow({
      targetType: ReportTargetType.MOVER,
      targetId: "not-a-uuid",
    });

    let moverLookupCalled = false;

    const service = createReportsService(
      createRepositoryStub({
        findReportById: async () => report,
        findMoverTargetById: async () => {
          moverLookupCalled = true;
          return null;
        },
      }),
    );

    const result = await service.getReportDetail(1);

    assert.equal(result.id, report.id);
    assert.equal(result.target, null);
    assert.equal(moverLookupCalled, false);
  });
});

describe("reportsService.handleReport", () => {
  it("PENDING 신고를 RESOLVED 처리하고 같은 transaction에서 ActivityLog와 Notification을 생성한 뒤 커밋 후 SSE를 전송한다", async () => {
    const pendingReport = createReportDetailRow();
    const resolvedReport = createReportDetailRow({
      status: ReportStatus.RESOLVED,
      handledBy: ADMIN_ID,
      handledAt: CREATED_AT,
      handlerNote: "신고 내용 확인 후 조치 완료",
      handler: {
        id: ADMIN_ID,
        name: "관리자",
        email: "admin@example.com",
      },
    });

    const transaction = createTransactionRunner();
    let receivedUpdate: Parameters<ReportsRepository["updateReportIfPending"]>[0] | undefined;
    let updateTx: Parameters<ReportsRepository["updateReportIfPending"]>[1];
    let logTx: Parameters<ReportsRepository["createActivityLog"]>[1];
    let notificationCreateCalled = false;
    let notificationSendCalled = false;
    let notificationUserId = "";
    let notificationTitle = "";
    let notificationContent = "";
    let notificationSourceId = "";
    let notificationExpiresAt: Date | null = null;

    const repository = createRepositoryStub({
      findReportById: async (_reportId, db) => {
        assert.equal(db, transaction.tx);
        return pendingReport;
      },
      updateReportIfPending: async (input, db) => {
        receivedUpdate = input;
        updateTx = db;
        return {
          ...resolvedReport,
          handledAt: input.handledAt,
        };
      },
      createActivityLog: async (input, db) => {
        logTx = db;
        return {
          id: 1,
          action: LogAction.UPDATE,
          targetType: LogTargetType.REPORT,
          targetId: input.targetId,
          memo: input.memo,
          createdAt: CREATED_AT,
          actor: {
            id: input.actorId,
            name: "관리자",
          },
        };
      },
    });

    const notificationService = {
      createNotification: async (input: {
        userId: string;
        type: NotificationType;
        title: string;
        content: string;
        sourceId?: string | null;
        expiresAt: Date | null;
      }) => {
        notificationCreateCalled = true;
        notificationUserId = input.userId;
        notificationTitle = input.title;
        notificationContent = input.content;
        notificationSourceId = input.sourceId ?? "";
        notificationExpiresAt = input.expiresAt;

        return {
          id: 1,
          type: input.type,
          title: input.title,
          content: input.content,
          linkUrl: null,
          isRead: false,
          readAt: null,
          expiresAt: input.expiresAt,
          createdAt: CREATED_AT,
        };
      },
      sendNotification: (userId: string) => {
        notificationSendCalled = true;
        notificationUserId = userId;
      },
    };

    const service = createReportsService(repository, transaction.run, notificationService);

    const result = await service.handleReport({
      adminId: ADMIN_ID,
      reportId: 1,
      input: {
        status: ReportStatus.RESOLVED,
        handlerNote: "신고 내용 확인 후 조치 완료",
      },
    });

    assert.equal(receivedUpdate?.reportId, 1);
    assert.equal(receivedUpdate?.status, ReportStatus.RESOLVED);
    assert.equal(receivedUpdate?.handledBy, ADMIN_ID);
    assert.equal(receivedUpdate?.handlerNote, "신고 내용 확인 후 조치 완료");
    assert.ok(receivedUpdate?.handledAt instanceof Date);
    assert.equal(updateTx, transaction.tx);
    assert.equal(logTx, transaction.tx);
    assert.equal(notificationCreateCalled, true);
    assert.equal(notificationSendCalled, true);
    assert.equal(notificationUserId, REPORTER_ID);
    assert.equal(notificationTitle, "신고 처리가 완료되었어요");
    assert.equal(notificationContent, "신고하신 내용에 대한 조치가 완료되었습니다.");
    assert.equal(notificationSourceId, "report:1");
    assert.notEqual(notificationExpiresAt, null);

    if (notificationExpiresAt === null) {
      assert.fail("notificationExpiresAt should not be null");
    }

    assert.equal(Object.prototype.toString.call(notificationExpiresAt), "[object Date]");
    assert.equal(result.status, ReportStatus.RESOLVED);
    assert.equal(result.handler?.id, ADMIN_ID);
  });

  it("PENDING 신고를 REJECTED 처리할 수 있고 반려 알림 문구를 사용한다", async () => {
    const pendingReport = createReportDetailRow();
    const rejectedReport = createReportDetailRow({
      status: ReportStatus.REJECTED,
      handledBy: ADMIN_ID,
      handledAt: CREATED_AT,
      handlerNote: "신고 사유에 해당하지 않음",
      handler: {
        id: ADMIN_ID,
        name: "관리자",
        email: "admin@example.com",
      },
    });

    const transaction = createTransactionRunner();
    let notificationTitle = "";
    let notificationContent = "";

    const repository = createRepositoryStub({
      findReportById: async () => pendingReport,
      updateReportIfPending: async () => rejectedReport,
    });

    const notificationService = {
      createNotification: async (input: {
        type: NotificationType;
        title: string;
        content: string;
        expiresAt: Date | null;
      }) => {
        notificationTitle = input.title;
        notificationContent = input.content;

        return {
          id: 1,
          type: input.type,
          title: input.title,
          content: input.content,
          linkUrl: null,
          isRead: false,
          readAt: null,
          expiresAt: input.expiresAt,
          createdAt: CREATED_AT,
        };
      },
      sendNotification: () => {},
    };

    const service = createReportsService(repository, transaction.run, notificationService);

    const result = await service.handleReport({
      adminId: ADMIN_ID,
      reportId: 1,
      input: {
        status: ReportStatus.REJECTED,
        handlerNote: "신고 사유에 해당하지 않음",
      },
    });

    assert.equal(result.status, ReportStatus.REJECTED);
    assert.equal(notificationTitle, "신고 검토가 완료되었어요");
    assert.equal(notificationContent, "신고하신 내용을 검토한 결과 별도 조치 없이 종료되었습니다.");
  });

  it("신고가 없으면 NOT_FOUND를 반환하고 업데이트하지 않는다", async () => {
    const transaction = createTransactionRunner();
    let updateCalled = false;
    let logCalled = false;

    const repository = createRepositoryStub({
      findReportById: async () => null,
      updateReportIfPending: async () => {
        updateCalled = true;
        return null;
      },
      createActivityLog: async (input) => {
        logCalled = true;
        return {
          id: 1,
          action: LogAction.UPDATE,
          targetType: LogTargetType.REPORT,
          targetId: input.targetId,
          memo: input.memo,
          createdAt: CREATED_AT,
          actor: {
            id: input.actorId,
            name: "관리자",
          },
        };
      },
    });

    const service = createReportsService(
      repository,
      transaction.run,
      createNotificationServiceStub(),
    );

    await assert.rejects(
      () =>
        service.handleReport({
          adminId: ADMIN_ID,
          reportId: 999,
          input: {
            status: ReportStatus.RESOLVED,
            handlerNote: "처리 완료",
          },
        }),
      assertAppError("NOT_FOUND"),
    );

    assert.equal(updateCalled, false);
    assert.equal(logCalled, false);
  });

  it("이미 처리된 신고는 CONFLICT를 반환한다", async () => {
    const processedReport = createReportDetailRow({
      status: ReportStatus.RESOLVED,
      handledBy: ADMIN_ID,
      handledAt: CREATED_AT,
      handlerNote: "이미 처리됨",
    });

    const transaction = createTransactionRunner();
    let updateCalled = false;
    let logCalled = false;

    const repository = createRepositoryStub({
      findReportById: async () => processedReport,
      updateReportIfPending: async () => {
        updateCalled = true;
        return null;
      },
      createActivityLog: async (input) => {
        logCalled = true;
        return {
          id: 1,
          action: LogAction.UPDATE,
          targetType: LogTargetType.REPORT,
          targetId: input.targetId,
          memo: input.memo,
          createdAt: CREATED_AT,
          actor: {
            id: input.actorId,
            name: "관리자",
          },
        };
      },
    });

    const service = createReportsService(
      repository,
      transaction.run,
      createNotificationServiceStub(),
    );

    await assert.rejects(
      () =>
        service.handleReport({
          adminId: ADMIN_ID,
          reportId: 1,
          input: {
            status: ReportStatus.REJECTED,
            handlerNote: "다시 처리",
          },
        }),
      assertAppError("CONFLICT"),
    );

    assert.equal(updateCalled, false);
    assert.equal(logCalled, false);
  });

  it("동시 처리 경쟁에서 선점에 실패하면 CONFLICT를 반환하고 로그를 생성하지 않는다", async () => {
    const pendingReport = createReportDetailRow();
    const transaction = createTransactionRunner();
    let logCalled = false;

    const repository = createRepositoryStub({
      findReportById: async () => pendingReport,
      updateReportIfPending: async () => null,
      createActivityLog: async (input) => {
        logCalled = true;
        return {
          id: 1,
          action: LogAction.UPDATE,
          targetType: LogTargetType.REPORT,
          targetId: input.targetId,
          memo: input.memo,
          createdAt: CREATED_AT,
          actor: {
            id: input.actorId,
            name: "관리자",
          },
        };
      },
    });

    const service = createReportsService(
      repository,
      transaction.run,
      createNotificationServiceStub(),
    );

    await assert.rejects(
      () =>
        service.handleReport({
          adminId: ADMIN_ID,
          reportId: 1,
          input: {
            status: ReportStatus.RESOLVED,
            handlerNote: "처리 완료",
          },
        }),
      assertAppError("CONFLICT"),
    );

    assert.equal(logCalled, false);
  });

  it("트랜잭션 내부 알림 저장이 실패하면 SSE를 전송하지 않는다", async () => {
    const pendingReport = createReportDetailRow();
    const transaction = createTransactionRunner();
    let sendCalled = false;

    const repository = createRepositoryStub({
      findReportById: async () => pendingReport,
      updateReportIfPending: async () =>
        createReportDetailRow({
          status: ReportStatus.RESOLVED,
          handledBy: ADMIN_ID,
          handledAt: CREATED_AT,
          handlerNote: "처리 완료",
        }),
    });

    const notificationService = {
      createNotification: async () => {
        throw new AppError("INTERNAL_SERVER_ERROR");
      },
      sendNotification: () => {
        sendCalled = true;
      },
    };

    const service = createReportsService(repository, transaction.run, notificationService);

    await assert.rejects(
      () =>
        service.handleReport({
          adminId: ADMIN_ID,
          reportId: 1,
          input: {
            status: ReportStatus.RESOLVED,
            handlerNote: "처리 완료",
          },
        }),
      assertAppError("INTERNAL_SERVER_ERROR"),
    );

    assert.equal(sendCalled, false);
  });
});
