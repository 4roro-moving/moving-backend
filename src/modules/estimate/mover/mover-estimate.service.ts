import type { MoveType } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { buildPagination } from "../../../utils/pagination.util";
import { lockEstimateRequestForUpdate } from "../../../utils/estimate-request-lock.util";
import { runTransaction } from "../../../utils/transaction";
import { notificationService } from "../../notification/notification.service";
import {
  assertEstimateRequestActionAllowed,
  assertMoverCanHandleMoveType,
  assertNoExistingMoverResponse,
  getMoverMoveTypes,
} from "./mover-estimate.action-policy";
import { getRejectionNotificationExpiresAt } from "./mover-estimate.notification-policy";
import { assertCompletableEstimate } from "./mover-estimate.completion-policy";
import {
  mapEstimateRejectionListItem,
  mapEstimateRequestListItem,
  mapSentEstimate,
} from "./mover-estimate.mapper";
import {
  moverEstimateRequestRepository,
  moverSentEstimateRepository,
} from "./mover-estimate.repository";
import type {
  MoverEstimateRequestListItem,
  MoverEstimateRequestListQuery,
  MoverEstimateRequestListResult,
  MoverEstimateRejectionListItem,
  MoverEstimateRejectionListQuery,
  MoverEstimateRejectionListResult,
  MoverSentEstimateListQuery,
  RejectEstimateParams,
  SendEstimateParams,
} from "./mover-estimate.type";

/* 
2026.07.22 add 윤소정
-기사 프로필 확인
-조회 조건 정리
-레퍼지토리 호출
-DB 결과 API 응답 형태로 가공
*/

const MOVE_TYPE_LABEL: Record<MoveType, string> = {
  SMALL: "소형이사",
  HOME: "가정이사",
  OFFICE: "사무실이사",
};

// =============================================================================
// 기사: 고객의 견적 요청 목록 조회
// =============================================================================

function getCursorId(cursor: string | undefined) {
  if (!cursor) {
    return undefined;
  }

  return Number(cursor);
}

async function findMoverProfileOrThrow(
  moverId: string,
  tx?: Parameters<typeof moverEstimateRequestRepository.findMoverProfile>[1],
) {
  const profile = await moverEstimateRequestRepository.findMoverProfile(moverId, tx);

  if (!profile) {
    throw new AppError("MOVER_NOT_FOUND");
  }

  return profile;
}

// 받은 요청 목록 처리
export const moverEstimateRequestService = {
  async getList(
    moverId: string,
    query: MoverEstimateRequestListQuery,
  ): Promise<MoverEstimateRequestListResult> {
    //기사 프로필 조회
    const profile = await findMoverProfileOrThrow(moverId);

    //기사 서비스 유형 배열 생성
    const serviceMoveTypes = profile.serviceTypes.map((serviceType) => {
      return serviceType.moveType;
    });

    //기사가 제공할 수 있음 && 사용자가 선택한 이사 유형 필터
    const moverMoveTypes = getMoverMoveTypes(serviceMoveTypes, query.moveType);

    //기사 서비스 지역 ID 배열 생성
    const moverRegionIds = profile.serviceAreas.map((serviceArea) => {
      return serviceArea.regionId;
    });

    const cursorId = getCursorId(query.cursor);
    const referenceDate = new Date();

    //목록 조회 요청
    const repositoryParams = {
      moverId,
      moverMoveTypes,
      moverRegionIds,
      query,
      cursorId,
      referenceDate,
    };
    const [rows, totalCount] = await Promise.all([
      moverEstimateRequestRepository.findMany(repositoryParams),
      moverEstimateRequestRepository.count(repositoryParams),
    ]);

    const hasNextPage = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const items: MoverEstimateRequestListItem[] = pageRows.map(mapEstimateRequestListItem);

    let nextCursor: string | null = null;
    const lastItem = items[items.length - 1];

    if (hasNextPage && lastItem) {
      nextCursor = String(lastItem.id);
    }

    return {
      items,
      pagination: {
        nextCursor,
        hasNextPage,
        totalCount,
      },
    };
  },

  /* 
- 2026.07.30 add 윤소정
기사 견적 반려 내역 조회
 */
  async getRejections(
    moverId: string,
    query: MoverEstimateRejectionListQuery,
  ): Promise<MoverEstimateRejectionListResult> {
    const rows = await moverEstimateRequestRepository.findRejections(moverId, query);
    const hasNextPage = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const items: MoverEstimateRejectionListItem[] = pageRows.map(mapEstimateRejectionListItem);

    return {
      items,
      pagination: {
        nextCursor: hasNextPage ? String(items.at(-1)?.id) : null,
        hasNextPage,
      },
    };
  },

  //견적 제안
  // 2026.08.03 정슬기 - [수정] 요청 행 FOR UPDATE 후 상태 재검증 (취소와 교차 시 SENT 잔존 방지)
  async sendEstimate({ estimateRequestId, moverId, input }: SendEstimateParams) {
    const result = await runTransaction(async (tx) => {
      const profile = await findMoverProfileOrThrow(moverId, tx);
      const serviceMoveTypes = profile.serviceTypes.map((serviceType) => serviceType.moveType);

      // 취소 트랜잭션과 직렬화 — 잠금 후 OPEN 여부를 다시 확인한다.
      const locked = await lockEstimateRequestForUpdate(tx, estimateRequestId);

      if (!locked) {
        throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
      }

      //견적 요청 존재 확인 (잠금 이후 최신 상태)
      const estimateRequest =
        await moverEstimateRequestRepository.findEstimateRequestForMoverAction(
          estimateRequestId,
          moverId,
          tx,
        );

      if (!estimateRequest) {
        throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
      }

      assertEstimateRequestActionAllowed(estimateRequest, "현재 견적을 보낼 수 없는 요청입니다.");
      assertMoverCanHandleMoveType(serviceMoveTypes, estimateRequest.moveType);
      assertNoExistingMoverResponse({
        sentEstimateCount: estimateRequest._count.estimates,
        rejectionCount: estimateRequest._count.rejections,
      });

      const isDesignated = estimateRequest._count.designatedMovers > 0;

      //견적 생성
      const estimate = await moverEstimateRequestRepository.createEstimate(
        {
          estimateRequestId,
          moverId,
          price: input.price,
          comment: input.comment,
          isDesignated,
        },
        tx,
      );

      const notification = await notificationService.createNotification(
        {
          userId: estimateRequest.customerId,
          type: "ESTIMATE_RECEIVED",
          title: "견적 도착",
          content: `${profile.nickname} 기사님의 ${MOVE_TYPE_LABEL[estimateRequest.moveType]} 견적`,
          //기사가 보낸 견적확인 가능한 대기중인 견적 페이지 연결
          linkUrl: `/estimates/pending`,
          expiresAt: estimateRequest.expiresAt,
        },
        tx,
      );

      return {
        estimate,
        customerId: estimateRequest.customerId,
        notification,
      };
    });

    notificationService.sendNotification(result.customerId, result.notification);

    return result.estimate;
  },

  // 견적 요청 반려
  async rejectEstimate({ estimateRequestId, moverId, input }: RejectEstimateParams) {
    const result = await runTransaction(async (tx) => {
      const profile = await findMoverProfileOrThrow(moverId, tx);
      const serviceMoveTypes = profile.serviceTypes.map((serviceType) => serviceType.moveType);

      // 취소/견적 전송 트랜잭션과 직렬화한 뒤 최신 상태 재확인
      const locked = await lockEstimateRequestForUpdate(tx, estimateRequestId);

      if (!locked) {
        throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
      }

      //견적 요청 조회 (잠금 이후 최신 상태)
      const estimateRequest =
        await moverEstimateRequestRepository.findEstimateRequestForMoverAction(
          estimateRequestId,
          moverId,
          tx,
        );

      if (!estimateRequest) {
        throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
      }

      assertEstimateRequestActionAllowed(estimateRequest, "현재 반려할 수 없는 견적 요청입니다.");
      assertMoverCanHandleMoveType(serviceMoveTypes, estimateRequest.moveType);
      assertNoExistingMoverResponse({
        sentEstimateCount: estimateRequest._count.estimates,
        rejectionCount: estimateRequest._count.rejections,
      });

      //데이터 생성
      const rejection = await moverEstimateRequestRepository.createEstimateRejection(
        {
          estimateRequestId,
          moverId,
          reason: input.reason,
        },
        tx,
      );

      const notificationCreatedAt = new Date();
      const notification = await notificationService.createNotification(
        {
          userId: estimateRequest.customerId,
          type: "ESTIMATE_REQUEST_REJECTED",
          title: "견적 요청 반려",
          content: profile.nickname,
          // 기사가 견적 요청을 반려했을 때 알림 클릭하면 해당 견적 요청 상세페에지로 이동 (반려 기사와 사유 확인)
          linkUrl: `/estimates/requests/${estimateRequestId}`,
          expiresAt: getRejectionNotificationExpiresAt(notificationCreatedAt),
        },
        tx,
      );

      return {
        rejection,
        customerId: estimateRequest.customerId,
        notification,
      };
    });

    notificationService.sendNotification(result.customerId, result.notification);

    return result.rejection;
  },
};

export const moverSentEstimateService = {
  async getList(moverId: string, query: MoverSentEstimateListQuery) {
    const [rows, totalCount] = await moverSentEstimateRepository.findMany(moverId, query);
    return {
      items: rows.map((row) => mapSentEstimate(row)),
      pagination: buildPagination(totalCount, query.page, query.limit),
    };
  },

  async getDetail(moverId: string, estimateId: number) {
    const row = await moverSentEstimateRepository.findDetail(moverId, estimateId);

    if (!row) {
      throw new AppError("ESTIMATE_NOT_FOUND");
    }

    return mapSentEstimate(row);
  },

  async complete(moverId: string, estimateId: number) {
    return runTransaction(async (tx) => {
      const initialEstimate = await moverSentEstimateRepository.findDetail(moverId, estimateId, tx);

      if (!initialEstimate) {
        throw new AppError("ESTIMATE_NOT_FOUND");
      }

      const locked = await lockEstimateRequestForUpdate(tx, initialEstimate.estimateRequest.id);

      if (!locked) {
        throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
      }

      const estimate = await moverSentEstimateRepository.findDetail(moverId, estimateId, tx);

      if (!estimate) {
        throw new AppError("ESTIMATE_NOT_FOUND");
      }

      assertCompletableEstimate(estimate);

      const completedAt = new Date();
      const result = await moverSentEstimateRepository.completeConfirmedRequest(
        estimate.estimateRequest.id,
        estimate.id,
        completedAt,
        tx,
      );

      if (result.count !== 1) {
        throw new AppError("CONFLICT", {
          message: "견적 상태가 변경되어 이사 완료 처리하지 못했습니다.",
        });
      }

      const completedEstimate = await moverSentEstimateRepository.findDetail(
        moverId,
        estimateId,
        tx,
      );

      if (!completedEstimate) {
        throw new AppError("ESTIMATE_NOT_FOUND");
      }

      return mapSentEstimate(completedEstimate);
    });
  },
};
