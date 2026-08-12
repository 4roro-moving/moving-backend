import type { Prisma } from "@prisma/client";

import logger from "../../config/logger";
import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import { lockEstimateRequestForUpdate } from "../../utils/estimate-request-lock.util";
import { buildPagination } from "../../utils/pagination.util";
import { runTransaction } from "../../utils/transaction";
import { notificationService } from "../notification/notification.service";

import {
  estimateRequestRepository,
  type EstimateRequestDetail,
} from "./estimateRequest.repository";
import type {
  AddressInput,
  CreateEstimateRequestInput,
  ListEstimateRequestQuery,
  UpdateEstimateRequestInput,
} from "./estimateRequest.type";
import { MAX_DESIGNATED_MOVERS, MOVE_TYPE_LABEL, SIDO_ALIAS } from "./estimateRequest.constants";
import {
  mapEstimateRequestProfileImageUrls,
  type EstimateRequestResponse,
} from "./estimateRequest.mapper";
import {
  assertCancelable,
  assertEditable,
  assertRequestNotExpired,
  resolveExpiresAt,
  resolveMoveDate,
} from "./estimateRequest.policy";
import { toHistorySnapshot } from "./estimateRequest.utils";

type Tx = Prisma.TransactionClient;
export { CANCELABLE_STATUSES, assertCancelable } from "./estimateRequest.policy";

// 주소의 시/도를 regions 레코드로 변환
async function resolveRegionId(address: AddressInput, db: Tx): Promise<number> {
  const trimmed = address.sido.trim();
  const name = SIDO_ALIAS[trimmed] ?? trimmed;

  const region = await estimateRequestRepository.findRegionByName(name, db);

  if (!region) {
    throw new AppError("REGION_NOT_FOUND", {
      data: { sido: address.sido },
    });
  }

  return region.id;
}

/* -------------------------------------------------------------------------- */
/* 공통 헬퍼                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * [A] 견적 요청을 조회하고, 존재 여부와 소유권을 함께 검증한다.
 * update / cancel / designate 등에서 반복되던 조회+검증을 한 곳으로 모은다.
 */
async function findOwnedRequestOrThrow(
  estimateRequestId: number,
  customerId: string,
  db: Tx,
): Promise<EstimateRequestDetail> {
  const request = await estimateRequestRepository.findById(estimateRequestId, db);

  if (!request) {
    throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
  }

  if (request.customerId !== customerId) {
    throw new AppError("FORBIDDEN", {
      message: "본인의 견적 요청만 접근할 수 있습니다.",
    });
  }

  return request;
}

/* -------------------------------------------------------------------------- */
/* 서비스                                                                       */
/* -------------------------------------------------------------------------- */

type CreateParams = {
  customerId: string;
  input: CreateEstimateRequestInput;
};

type UpdateParams = {
  estimateRequestId: number;
  customerId: string;
  input: UpdateEstimateRequestInput;
};

type DesignateParams = {
  estimateRequestId: number;
  customerId: string;
  moverId: string;
};

type CancelDesignatedMoverParams = {
  estimateRequestId: number;
  customerId: string;
  moverId: string;
};

export const estimateRequestService = {
  /**
   * 견적 요청을 생성하고 매칭된 기사님들에게 알림을 보낸다. 진행 중인 견적 요청이 이미 존재하면 에러를 던진다.
   */
  async createEstimateRequest({
    customerId,
    input,
  }: CreateParams): Promise<EstimateRequestResponse> {
    const moveDate = resolveMoveDate(input.moveDate);
    const expiresAt = resolveExpiresAt(moveDate);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await estimateRequestRepository.findActiveByCustomerId(customerId, tx);

      if (existing) {
        throw new AppError("ACTIVE_REQUEST_EXISTS", {
          data: { activeRequestId: existing.id },
        });
      }

      const [fromRegionId, toRegionId] = await Promise.all([
        resolveRegionId(input.from, tx),
        resolveRegionId(input.to, tx),
      ]);

      const created = await estimateRequestRepository.create(
        {
          customerId,
          moveType: input.moveType,
          moveDate,
          fromZipCode: input.from.zipCode ?? "",
          fromAddress: input.from.address,
          ...(input.from.detailAddress !== undefined && {
            fromDetailAddress: input.from.detailAddress,
          }),
          fromRegionId,
          toZipCode: input.to.zipCode ?? "",
          toAddress: input.to.address,
          ...(input.to.detailAddress !== undefined && {
            toDetailAddress: input.to.detailAddress,
          }),
          toRegionId,
          status: "OPEN",
          isActive: true,
          expiresAt,
        },
        tx,
      );

      await estimateRequestRepository.createHistory(
        {
          estimateRequestId: created.id,
          changedBy: customerId,
          type: "CREATED",
          changedData: toHistorySnapshot(created),
        },
        tx,
      );

      const moverIds = await estimateRequestRepository.findMatchingMoverIds(
        { fromRegionId, toRegionId, moveType: input.moveType },
        tx,
      );

      // 알림 DB 저장은 핵심 작업과 같은 트랜잭션에 포함한다(알림 필수).
      // SSE 전송은 롤백이 불가하므로 커밋 이후 별도로 처리한다.
      const notifications = await Promise.all(
        moverIds.map(async (moverId) => {
          const notification = await notificationService.createNotification(
            {
              userId: moverId,
              type: "ESTIMATE_REQUEST_RECEIVED",
              title: "새로운 견적 요청이 도착했어요",
              content: MOVE_TYPE_LABEL[created.moveType],
              linkUrl: `/estimate/received-requests`,
              expiresAt: null,
            },
            tx,
          );

          return { userId: moverId, notification };
        }),
      );

      return { created, notifications };
    });

    // 커밋 이후 SSE 전송 (실패해도 이미 커밋된 견적 요청에는 영향 없음)
    for (const { userId, notification } of result.notifications) {
      notificationService.sendNotification(userId, notification);
    }

    return mapEstimateRequestProfileImageUrls(result.created);
  },

  /**
   * 진행 중인 견적 요청을 조회하고 없으면 null 을 반환
   */
  async getActiveEstimateRequest(customerId: string): Promise<EstimateRequestResponse | null> {
    const request = await estimateRequestRepository.findActiveByCustomerId(customerId);

    return request ? mapEstimateRequestProfileImageUrls(request) : null;
  },

  async getEstimateRequestById(
    estimateRequestId: number,
    customerId: string,
  ): Promise<EstimateRequestResponse> {
    const request = await findOwnedRequestOrThrow(estimateRequestId, customerId, prisma);

    return mapEstimateRequestProfileImageUrls(request);
  },

  async getMyEstimateRequestList(customerId: string, query: ListEstimateRequestQuery) {
    const { page, limit, status } = query;

    const { items, totalCount } = await estimateRequestRepository.findManyByCustomerId({
      customerId,
      skip: (page - 1) * limit,
      take: limit,
      ...(status !== undefined ? { status } : {}),
    });

    return {
      estimateRequests: items.map(mapEstimateRequestProfileImageUrls),
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  /**
   * 견적이 도착하기 전까지만 수정가능
   */
  async updateEstimateRequest({
    estimateRequestId,
    customerId,
    input,
  }: UpdateParams): Promise<EstimateRequestResponse> {
    const updated = await prisma.$transaction(async (tx) => {
      const request = await findOwnedRequestOrThrow(estimateRequestId, customerId, tx);

      assertEditable(request);

      if (request._count.estimates > 0) {
        throw new AppError("REQUEST_NOT_EDITABLE");
      }

      const data: Prisma.EstimateRequestUncheckedUpdateInput = {};

      if (input.moveType !== undefined) {
        data.moveType = input.moveType;
      }

      if (input.moveDate !== undefined) {
        const moveDate = resolveMoveDate(input.moveDate);

        data.moveDate = moveDate;
        data.expiresAt = resolveExpiresAt(moveDate);
      }

      if (input.from !== undefined) {
        data.fromZipCode = input.from.zipCode ?? "";
        data.fromAddress = input.from.address;
        data.fromDetailAddress = input.from.detailAddress ?? null;
        data.fromRegionId = await resolveRegionId(input.from, tx);
      }

      if (input.to !== undefined) {
        data.toZipCode = input.to.zipCode ?? "";
        data.toAddress = input.to.address;
        data.toDetailAddress = input.to.detailAddress ?? null;
        data.toRegionId = await resolveRegionId(input.to, tx);
      }

      const updated = await estimateRequestRepository.update(estimateRequestId, data, tx);

      await estimateRequestRepository.createHistory(
        {
          estimateRequestId,
          changedBy: customerId,
          type: "UPDATED",
          previousData: toHistorySnapshot(request),
          changedData: toHistorySnapshot(updated),
        },
        tx,
      );

      return updated;
    });

    return mapEstimateRequestProfileImageUrls(updated);
  },

  /**
   * 견적 요청 soft cancel (hard delete 금지)
   * - PENDING|OPEN + isActive 만 허용
   * - CONFIRMED|COMPLETED|EXPIRED|CANCELED 및 isActive=false 는 거부
   * - 미확정(SENT) 견적은 CANCELED 로 맞춤. 지정 기사 이력은 보존
   * - 동시 취소는 claimCancel(updateMany)로 선점
   * - sendEstimate 와의 교차는 요청 행 FOR UPDATE 로 직렬화
   * - SENT·지정 기사에게 ESTIMATE_REQUEST_CANCELED 알림 (커밋 후, 실패 격리)
   * // 2026.08.03 정슬기 - [수정] CONFIRMED 차단·SENT 견적 처리·에러 코드 세분화
   * // 2026.08.03 정슬기 - [수정] 견적 전송과 원자적 직렬화를 위한 행 잠금
   * // 2026.08.03 정슬기 - [추가] 취소 알림 연결
   */
  async cancelEstimateRequest(
    estimateRequestId: number,
    customerId: string,
  ): Promise<EstimateRequestResponse> {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await lockEstimateRequestForUpdate(tx, estimateRequestId);

      if (!locked) {
        throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
      }

      const request = await findOwnedRequestOrThrow(estimateRequestId, customerId, tx);

      assertCancelable(request);

      // cancelSentEstimates 전에 SENT 기사 ID를 확보한다
      const sentMoverIds = await estimateRequestRepository.findSentEstimateMoverIds(
        estimateRequestId,
        tx,
      );
      const notifyMoverIds = [
        ...new Set([...sentMoverIds, ...request.designatedMovers.map((item) => item.moverId)]),
      ];

      const customer = await estimateRequestRepository.findCustomerName(customerId, tx);
      const customerName = customer?.name ?? "고객";

      const canceledAt = new Date();
      const claimed = await estimateRequestRepository.claimCancelEstimateRequest(
        estimateRequestId,
        customerId,
        canceledAt,
        tx,
      );

      // 동시 요청으로 상태가 바뀐 경우 — 최신 상태로 재검증해 동일 에러를 반환
      if (claimed.count === 0) {
        const latest = await findOwnedRequestOrThrow(estimateRequestId, customerId, tx);
        assertCancelable(latest);
        throw new AppError("ESTIMATE_REQUEST_CANCEL_NOT_ALLOWED");
      }

      await estimateRequestRepository.cancelSentEstimatesForRequest(
        estimateRequestId,
        canceledAt,
        tx,
      );

      await estimateRequestRepository.createHistory(
        {
          estimateRequestId,
          changedBy: customerId,
          type: "CANCELED",
          previousData: { status: request.status, isActive: request.isActive },
          changedData: {
            status: "CANCELED",
            isActive: false,
            canceledAt: canceledAt.toISOString(),
          },
        },
        tx,
      );

      const canceled = await estimateRequestRepository.findById(estimateRequestId, tx);

      if (!canceled) {
        throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
      }

      return {
        canceled,
        notifyMoverIds,
        customerName,
      };
    });

    // 알림 실패가 취소 성공 응답을 덮지 않도록 격리
    await Promise.all(
      result.notifyMoverIds.map(async (moverId) => {
        try {
          await notificationService.createNotification({
            userId: moverId,
            type: "ESTIMATE_REQUEST_CANCELED",
            title: "견적 요청 취소",
            // FE: content + " 님이 견적 요청을 취소했어요"
            content: result.customerName,
            //고객이 견적 취소 시 알림 클릭하면 받은 요청 페이지 연결
            // 기사가 견적을 보낸 경우, 고객이 지정 요청만 한 경우 둘다 알림을 받기 떄문
            linkUrl: `/estimate/received-requests`,
            expiresAt: null,
          });
        } catch (error) {
          logger.error("Failed to create ESTIMATE_REQUEST_CANCELED notification.", {
            error,
            estimateRequestId,
            moverId,
          });
        }
      }),
    );

    return mapEstimateRequestProfileImageUrls(result.canceled);
  },

  /**
   * 특정 기사님을 지정해 견적을 요청
   */
  async designateMover({
    estimateRequestId,
    customerId,
    moverId,
  }: DesignateParams): Promise<EstimateRequestResponse> {
    const result = await prisma.$transaction(async (tx) => {
      const request = await findOwnedRequestOrThrow(estimateRequestId, customerId, tx);

      assertEditable(request, "지금은 지정 견적을 요청할 수 없는 상태입니다.");
      assertRequestNotExpired(request.expiresAt);

      const mover = await estimateRequestRepository.findMoverForDesignation(moverId, tx);

      if (!mover) {
        throw new AppError("MOVER_NOT_FOUND");
      }

      const rejection = await estimateRequestRepository.findRejection(
        estimateRequestId,
        moverId,
        tx,
      );

      if (rejection) {
        throw new AppError("DESIGNATION_ALREADY_REJECTED");
      }

      const existing = await estimateRequestRepository.findDesignation(
        estimateRequestId,
        moverId,
        tx,
      );

      if (existing) {
        throw new AppError("ALREADY_DESIGNATED");
      }

      const designationCount = await estimateRequestRepository.countDesignations(
        estimateRequestId,
        tx,
      );

      if (designationCount >= MAX_DESIGNATED_MOVERS) {
        throw new AppError("DESIGNATION_LIMIT_EXCEEDED");
      }

      await estimateRequestRepository.createDesignation(estimateRequestId, moverId, tx);

      const notification = await notificationService.createNotification(
        {
          userId: moverId,
          type: "DESIGNATED_REQUEST_RECEIVED",
          title: "지정 견적 요청이 도착했어요",
          content: MOVE_TYPE_LABEL[request.moveType],
          // 지정 견적 요청이 있는 알림이므로 받은 요청 페이지 연결
          linkUrl: `/estimate/received-requests`,
          expiresAt: null,
        },
        tx,
      );

      const detail = await findOwnedRequestOrThrow(estimateRequestId, customerId, tx);

      return { detail, notification, moverId };
    });

    notificationService.sendNotification(result.moverId, result.notification);

    return mapEstimateRequestProfileImageUrls(result.detail);
  },

  /**
   * 지정한 기사님 한 명의 견적 요청을 취소
   *
   * 견적 제출과 지정 취소가 동시에 발생할 경우 데이터 정합성이 깨지지 않도록
   * EstimateRequest 행을 FOR UPDATE로 잠근 뒤 취소 가능 여부를 확인한다.
   */
  async cancelDesignatedMover({
    estimateRequestId,
    customerId,
    moverId,
  }: CancelDesignatedMoverParams): Promise<EstimateRequestResponse> {
    const updated = await runTransaction(async (tx) => {
      // 견적 제출(sendEstimate)과 동일한 요청 행을 잠가 두 작업을 직렬화한다.
      const locked = await lockEstimateRequestForUpdate(tx, estimateRequestId);

      if (!locked) {
        throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
      }

      // 잠금 이후 최신 상태를 기준으로 소유권 및 요청 상태를 확인한다.
      const request = await findOwnedRequestOrThrow(estimateRequestId, customerId, tx);

      assertEditable(request, "지금은 지정 견적 요청을 취소할 수 없는 상태입니다.");
      assertRequestNotExpired(request.expiresAt);

      const designation = await estimateRequestRepository.findDesignation(
        estimateRequestId,
        moverId,
        tx,
      );

      if (!designation) {
        throw new AppError("DESIGNATION_NOT_FOUND");
      }

      const rejection = await estimateRequestRepository.findRejection(
        estimateRequestId,
        moverId,
        tx,
      );

      if (rejection) {
        throw new AppError("DESIGNATION_CANCEL_NOT_ALLOWED", {
          message: "이미 반려된 지정 견적 요청은 취소할 수 없습니다.",
        });
      }

      // 요청 행 잠금 이후 견적 존재 여부를 확인해
      // 견적 제출과 지정 취소 사이의 경쟁 상태를 방지한다.
      const estimate = await estimateRequestRepository.findEstimateByMover(
        estimateRequestId,
        moverId,
        tx,
      );

      if (estimate) {
        throw new AppError("DESIGNATION_CANCEL_NOT_ALLOWED");
      }

      await estimateRequestRepository.deleteDesignation(estimateRequestId, moverId, tx);

      return findOwnedRequestOrThrow(estimateRequestId, customerId, tx);
    });

    return mapEstimateRequestProfileImageUrls(updated);
  },
};
