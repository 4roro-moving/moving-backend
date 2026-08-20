import logger from "../../../config/logger";
import { AppError } from "../../../lib/app-error";
import { getProfileImageUrl } from "../../../utils/image-url";
import { buildPagination } from "../../../utils/pagination.util";
import { runTransaction } from "../../../utils/transaction";
import { notificationService } from "../../notification/notification.service";
import { moverCalendarRepository } from "../../mover-calendar/mover-calendar.repository";
import { resolveEstimateMoveDate } from "../estimate-date";
import { mapDetailEstimate, mapListEstimate } from "./customer-estimate.mapper";
import { assertConfirmableReceivedEstimate } from "./customer-estimate.policy";
import { receivedEstimateRepository } from "./customer-estimate.repository";
import type {
  ConfirmReceivedEstimateParams,
  GetReceivedEstimateDetailParams,
  GetReceivedEstimateListParams,
  PendingEstimateQuery,
} from "./customer-estimate.type";
import { getKstEndOfDay } from "./customer-estimate.utils";

/*
2026.07.23 add 김성현
- 받은 견적 목록 비즈니스 로직
- 받은 견적 상세 비즈니스 로직
- 받은 견적 확정 비즈니스 로직
*/

function assertCustomerOwnership(ownerId: string, customerId: string, message: string): void {
  if (ownerId !== customerId) {
    throw new AppError("FORBIDDEN", {
      message,
    });
  }
}

function buildEstimateConfirmedNotificationPayload(params: {
  moverId: string;
  customerName: string;
  moveDate: Date;
}) {
  return {
    userId: params.moverId,
    type: "ESTIMATE_CONFIRMED" as const,
    title: "견적 확정",
    content: `${params.customerName}님의`,
    linkUrl: "/estimate/sent",
    expiresAt: getKstEndOfDay(params.moveDate),
  };
}

// =============================================================================
// 고객: 기사에게 받은 견적 목록·상세 조회 및 견적 확정
// =============================================================================

export const receivedEstimateService = {
  // 2026.07.27 add 김성현
  // FE 대기 견적 화면에 맞춘 section 응답 조립
  async getPendingEstimateRequests(customerId: string, query: PendingEstimateQuery) {
    const referenceDate = new Date();
    const [estimateRequests, totalCount] =
      await receivedEstimateRepository.findPendingEstimateRequests(
        customerId,
        query,
        referenceDate,
      );

    return {
      sections: estimateRequests.map((estimateRequest) => ({
        request: {
          id: estimateRequest.id,
          customerId: estimateRequest.customerId,
          moveType: estimateRequest.moveType,
          moveDate: estimateRequest.moveDate,
          fromZipCode: estimateRequest.fromZipCode,
          fromAddress: estimateRequest.fromAddress,
          fromDetailAddress: estimateRequest.fromDetailAddress,
          fromRegion: estimateRequest.fromRegion,
          toZipCode: estimateRequest.toZipCode,
          toAddress: estimateRequest.toAddress,
          toDetailAddress: estimateRequest.toDetailAddress,
          toRegion: estimateRequest.toRegion,
          status: estimateRequest.status,
          isActive: estimateRequest.isActive,
          expiresAt: estimateRequest.expiresAt,
          createdAt: estimateRequest.createdAt,
          canceledAt: estimateRequest.canceledAt,
          designatedMovers: estimateRequest.designatedMovers,
          _count: estimateRequest._count,
        },
        estimates: estimateRequest.estimates.map(mapListEstimate),
      })),
      pagination: buildPagination(totalCount, query.page, query.limit),
    };
  },

  // 2026.07.24 정슬기 - [추가] 받은 견적이 있는 요청을 패널 단위로 조회
  async getReceivedEstimatePanels(customerId: string) {
    const panels = await receivedEstimateRepository.findReceivedEstimatePanels(customerId);

    return panels.map((panel) => ({
      estimateRequest: {
        id: panel.id,
        moveType: panel.moveType,
        moveDate: panel.moveDate,
        fromAddress: panel.fromAddress,
        toAddress: panel.toAddress,
        status: panel.status,
        createdAt: panel.createdAt,
        confirmedEstimateId: panel.confirmedEstimateId,
      },
      estimates: panel.estimates.map(mapListEstimate),
    }));
  },

  async getReceivedEstimateList({ estimateRequestId, customerId }: GetReceivedEstimateListParams) {
    const estimateRequest =
      await receivedEstimateRepository.findEstimateRequestById(estimateRequestId);

    if (!estimateRequest) {
      throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
    }

    assertCustomerOwnership(
      estimateRequest.customerId,
      customerId,
      "본인의 견적 요청만 조회할 수 있습니다.",
    );

    const estimates = await receivedEstimateRepository.findReceivedEstimatesByEstimateRequestId(
      estimateRequestId,
      customerId,
    );

    return {
      estimateRequest: {
        id: estimateRequest.id,
        moveType: estimateRequest.moveType,
        moveDate: estimateRequest.moveDate,
        fromAddress: estimateRequest.fromAddress,
        toAddress: estimateRequest.toAddress,
        status: estimateRequest.status,
        createdAt: estimateRequest.createdAt,
        confirmedEstimateId: estimateRequest.confirmedEstimateId,
      },
      estimates: estimates.map(mapListEstimate),
    };
  },

  async getReceivedEstimateDetail({
    estimateRequestId,
    estimateId,
    customerId,
  }: GetReceivedEstimateDetailParams) {
    //받은 견적 상세 조회
    const estimate = await receivedEstimateRepository.findReceivedEstimateDetail(
      estimateRequestId,
      estimateId,
      customerId,
    );

    if (!estimate) {
      throw new AppError("ESTIMATE_NOT_FOUND");
    }

    assertCustomerOwnership(
      estimate.estimateRequest.customerId,
      customerId,
      "본인의 견적 요청에 도착한 견적만 조회할 수 있습니다.",
    );

    return mapDetailEstimate(estimate);
  },

  // 2026.07.24 정슬기 - [추가] estimateId만으로 소유 견적 상세 조회
  async getReceivedEstimateDetailById(estimateId: number, customerId: string) {
    const estimate = await receivedEstimateRepository.findReceivedEstimateDetailById(
      estimateId,
      customerId,
    );

    if (!estimate) {
      throw new AppError("ESTIMATE_NOT_FOUND");
    }

    return mapDetailEstimate(estimate);
  },

  // 2026.07.24 정슬기 - [추가] estimateId만으로 확정한 뒤 FE용 상세 응답을 반환 (원격 확정 로직 재사용)
  async confirmReceivedEstimateById(estimateId: number, customerId: string) {
    const estimate = await receivedEstimateRepository.findEstimateRequestIdByEstimateId(
      estimateId,
      customerId,
    );

    if (!estimate) {
      throw new AppError("ESTIMATE_NOT_FOUND");
    }

    await this.confirmReceivedEstimate({
      estimateRequestId: estimate.estimateRequestId,
      estimateId: estimate.id,
      customerId,
    });

    return this.getReceivedEstimateDetailById(estimateId, customerId);
  },

  async confirmReceivedEstimate({
    estimateRequestId,
    estimateId,
    customerId,
  }: ConfirmReceivedEstimateParams) {
    const result = await runTransaction(async (tx) => {
      //확정 대상 견적 조회
      const estimate = await receivedEstimateRepository.findReceivedEstimateForConfirm(
        estimateRequestId,
        estimateId,
        tx,
      );

      if (!estimate) {
        throw new AppError("NOT_FOUND", {
          message: "견적을 찾을 수 없습니다.",
        });
      }

      assertCustomerOwnership(
        estimate.estimateRequest.customerId,
        customerId,
        "본인의 견적 요청에 도착한 견적만 확정할 수 있습니다.",
      );
      assertConfirmableReceivedEstimate({
        estimateStatus: estimate.status,
        requestStatus: estimate.estimateRequest.status,
        confirmedEstimateId: estimate.estimateRequest.confirmedEstimateId,
      });

      const effectiveMoveDate = resolveEstimateMoveDate(estimate);
      //캘린더 검증 추가
      //견적을 확정하기 전에 이사 날짜를 받아와서 날짜 단위로 정규화함
      const moveDate = new Date(effectiveMoveDate);
      moveDate.setUTCHours(0, 0, 0, 0);

      //해당 기사와 날짜 잠금
      await moverCalendarRepository.lockMoverDate(estimate.moverId, moveDate, tx);

      //날짜 상태 병렬 조회
      //잠금 획득 후 1. 기사가 해당 날짜 휴무로 등록했는지 2. 이미 확정된 이사가 있는지 확인
      const [unavailableDate, confirmedMoveCount] = await Promise.all([
        moverCalendarRepository.findUnavailableDate(estimate.moverId, moveDate, tx),
        moverCalendarRepository.countConfirmedMoves(estimate.moverId, moveDate, tx),
      ]);

      //휴무일 검증
      if (unavailableDate) {
        throw new AppError("MOVER_DATE_OFF");
      }
      //예약 마감 검증
      if (confirmedMoveCount > 0) {
        throw new AppError("MOVER_DATE_FULL");
      }

      const confirmedAt = new Date();

      //견적 요청 확정 상태 선점
      const claimedEstimateRequest =
        await receivedEstimateRepository.claimEstimateRequestForConfirm(
          estimateRequestId,
          estimate.id,
          tx,
        );

      if (claimedEstimateRequest.count === 0) {
        throw new AppError("CONFLICT", {
          message: "이미 확정되었거나 확정할 수 없는 견적 요청입니다.",
        });
      }

      //선택 견적 확정
      const confirmedEstimate = await receivedEstimateRepository.confirmEstimate(
        estimate.id,
        confirmedAt,
        tx,
      );

      //기사 프로필 존재 확인
      const moverProfile = await receivedEstimateRepository.findMoverProfileByUserId(
        confirmedEstimate.mover.id,
        tx,
      );

      if (!moverProfile) {
        throw new AppError("MOVER_PROFILE_REQUIRED");
      }

      //기사 확정 견적 수 증가
      await receivedEstimateRepository.incrementMoverConfirmedCount(confirmedEstimate.mover.id, tx);

      //미선택 견적 만료 처리
      const expiredEstimates = await receivedEstimateRepository.expireOtherSentEstimates(
        estimateRequestId,
        estimate.id,
        confirmedAt,
        tx,
      );

      //확정된 견적 요청 조회
      const confirmedEstimateRequest =
        await receivedEstimateRepository.findConfirmedEstimateRequestById(estimateRequestId, tx);

      if (!confirmedEstimateRequest) {
        throw new AppError("NOT_FOUND", {
          message: "확정된 견적 요청을 찾을 수 없습니다.",
        });
      }

      //견적 요청 변경 이력 생성
      await receivedEstimateRepository.createEstimateRequestHistory(
        {
          estimateRequestId,
          changedBy: customerId,
          type: "UPDATED",
          previousData: {
            status: estimate.estimateRequest.status,
            confirmedEstimateId: estimate.estimateRequest.confirmedEstimateId,
          },
          changedData: {
            status: confirmedEstimateRequest.status,
            confirmedEstimateId: confirmedEstimateRequest.confirmedEstimateId,
          },
        },
        tx,
      );

      const notificationPayload = buildEstimateConfirmedNotificationPayload({
        moverId: confirmedEstimate.mover.id,
        customerName: estimate.estimateRequest.customer.name,
        moveDate: effectiveMoveDate,
      });

      //확정 응답 형태 가공
      return {
        estimateRequest: confirmedEstimateRequest,
        moveDate: effectiveMoveDate,
        customerName: estimate.estimateRequest.customer.name,
        notificationPayload,
        estimate: {
          id: confirmedEstimate.id,
          price: confirmedEstimate.price,
          status: confirmedEstimate.status,
          confirmedAt: confirmedEstimate.confirmedAt,
          mover: {
            id: confirmedEstimate.mover.id,
            name: confirmedEstimate.mover.name,
            nickname: confirmedEstimate.mover.moverProfile?.nickname ?? null,
            imageUrl: getProfileImageUrl(confirmedEstimate.mover.moverProfile?.imageUrl ?? null),
          },
        },
        expiredEstimateCount: expiredEstimates.count,
      };
    });

    // 2026.08.03 정슬기 - [수정] 알림 실패가 확정 성공 응답을 덮지 않도록 격리
    try {
      const notification = await notificationService.createNotification(result.notificationPayload);

      notificationService.sendNotification(result.notificationPayload.userId, notification);
    } catch (error) {
      logger.error("Failed to create ESTIMATE_CONFIRMED notification.", {
        error,
        estimateId: result.estimate.id,
        userId: result.notificationPayload.userId,
      });
    }

    const { notificationPayload: _, ...response } = result;

    return response;
  },
};
