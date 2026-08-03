import type { EstimateRequestStatus, EstimateStatus, MoveType } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { buildPagination } from "../../../utils/pagination.util";
import { runTransaction } from "../../../utils/transaction";
import { notificationService } from "../../notification/notification.service";
import { getRejectionNotificationExpiresAt } from "./mover-estimate.notification-policy";
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

//기사가 실제로 제공할 수 있는 이사 유형 / 클라이언트 필터로 선택한 이사 유형
function getMoverMoveTypes(
  serviceMoveTypes: MoveType[],
  requestedMoveTypes: MoveType[] | undefined,
) {
  if (!requestedMoveTypes) {
    return serviceMoveTypes;
  }

  return serviceMoveTypes.filter((moveType) => requestedMoveTypes.includes(moveType));
}

// 받은 요청 목록 처리
export const moverEstimateRequestService = {
  async getList(
    moverId: string,
    query: MoverEstimateRequestListQuery,
  ): Promise<MoverEstimateRequestListResult> {
    //기사 프로필 조회
    const profile = await moverEstimateRequestRepository.findMoverProfile(moverId);

    if (!profile) {
      throw new AppError("MOVER_NOT_FOUND");
    }

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
    const items: MoverEstimateRequestListItem[] = pageRows.map((row) => {
      const isDesignated = row.designatedMovers.some((designation) => {
        return designation.moverId === moverId;
      });

      return {
        id: row.id,
        customer: row.customer,
        moveType: row.moveType,
        moveDate: row.moveDate.toISOString(),
        fromAddress: row.fromAddress,
        toAddress: row.toAddress,
        fromRegion: row.fromRegion.name,
        toRegion: row.toRegion.name,
        isDesignated,
        createdAt: row.createdAt.toISOString(),
      };
    });

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
    const items: MoverEstimateRejectionListItem[] = pageRows.map((row) => ({
      id: row.id,
      reason: row.reason,
      rejectedAt: row.createdAt.toISOString(),
      request: {
        id: row.estimateRequest.id,
        customer: row.estimateRequest.customer,
        moveType: row.estimateRequest.moveType,
        moveDate: row.estimateRequest.moveDate.toISOString(),
        fromAddress: row.estimateRequest.fromAddress,
        toAddress: row.estimateRequest.toAddress,
        fromRegion: row.estimateRequest.fromRegion.name,
        toRegion: row.estimateRequest.toRegion.name,
        isDesignated: row.estimateRequest.designatedMovers.length > 0,
      },
    }));

    return {
      items,
      pagination: {
        nextCursor: hasNextPage ? String(items.at(-1)?.id) : null,
        hasNextPage,
      },
    };
  },

  //견적 제안
  async sendEstimate({ estimateRequestId, moverId, input }: SendEstimateParams) {
    const result = await runTransaction(async (tx) => {
      const profile = await moverEstimateRequestRepository.findMoverProfile(moverId, tx);

      //기사 프로필 존재 확인
      if (!profile) {
        throw new AppError("MOVER_NOT_FOUND");
      }

      //견적 요청 존재 확인
      const estimateRequest =
        await moverEstimateRequestRepository.findEstimateRequestForMoverAction(
          estimateRequestId,
          moverId,
          tx,
        );

      if (!estimateRequest) {
        throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
      }

      //요청이 open인지, 활성 상태인지, 확정된 견적 없는지 확인
      if (
        estimateRequest.status !== "OPEN" ||
        !estimateRequest.isActive ||
        estimateRequest.confirmedEstimateId !== null
      ) {
        throw new AppError("CONFLICT", {
          message: "현재 견적을 보낼 수 없는 요청입니다.",
        });
      }

      //만료되지 않았는지 확인
      if (estimateRequest.expiresAt.getTime() <= Date.now()) {
        throw new AppError("CONFLICT", {
          message: "만료된 견적 요청입니다.",
        });
      }

      //기사가 해당 이사 유형 서비스할 수 있는지 확인
      const canHandleMoveType = profile.serviceTypes.some(
        (serviceType) => serviceType.moveType === estimateRequest.moveType,
      );

      if (!canHandleMoveType) {
        throw new AppError("FORBIDDEN", {
          message: "서비스할 수 없는 이사 유형입니다.",
        });
      }

      //이미 견적 보내지 않았는지 확인
      if (estimateRequest.estimates.length > 0) {
        throw new AppError("CONFLICT", {
          message: "이미 견적을 보낸 요청입니다.",
        });
      }

      //이미 반려하지 않았는지 확인
      if (estimateRequest.rejections.length > 0) {
        throw new AppError("CONFLICT", {
          message: "이미 반려한 견적 요청입니다.",
        });
      }

      const isDesignated = estimateRequest.designatedMovers.length > 0;

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
          linkUrl: null,
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
      //기사 프로필
      const profile = await moverEstimateRequestRepository.findMoverProfile(moverId, tx);

      if (!profile) {
        throw new AppError("MOVER_NOT_FOUND");
      }

      //견적 요청 조회
      const estimateRequest =
        await moverEstimateRequestRepository.findEstimateRequestForMoverAction(
          estimateRequestId,
          moverId,
          tx,
        );

      if (!estimateRequest) {
        throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
      }

      //요청이 open인지, 활성 상태인지, 확정된 견적 없는지 확인
      if (
        estimateRequest.status !== "OPEN" ||
        !estimateRequest.isActive ||
        estimateRequest.confirmedEstimateId !== null
      ) {
        throw new AppError("CONFLICT", {
          message: "현재 반려할 수 없는 견적 요청입니다.",
        });
      }

      //만료 여부 확인
      if (estimateRequest.expiresAt.getTime() <= Date.now()) {
        throw new AppError("CONFLICT", {
          message: "만료된 견적 요청입니다.",
        });
      }

      //기사가 해당 이사 유형을 서비스하는지 확인
      const canHandleMoveType = profile.serviceTypes.some(
        (serviceType) => serviceType.moveType === estimateRequest.moveType,
      );

      if (!canHandleMoveType) {
        throw new AppError("FORBIDDEN", {
          message: "서비스할 수 없는 이사 유형입니다.",
        });
      }

      //이미 견적 보냈는지 확인
      if (estimateRequest.estimates.length > 0) {
        throw new AppError("CONFLICT", {
          message: "이미 견적을 보낸 요청입니다.",
        });
      }

      //이미 반려했는지 확인
      if (estimateRequest.rejections.length > 0) {
        throw new AppError("CONFLICT", {
          message: "이미 반려한 견적 요청입니다.",
        });
      }

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
          linkUrl: null,
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

function getSentEstimateDisplayStatus(
  estimateStatus: EstimateStatus,
  requestStatus: EstimateRequestStatus,
) {
  if (requestStatus === "COMPLETED") {
    return "COMPLETED" as const;
  }
  if (estimateStatus === "CONFIRMED") {
    return "CONFIRMED" as const;
  }
  return "SENT" as const;
}

function mapSentEstimate(row: Awaited<ReturnType<typeof moverSentEstimateRepository.findDetail>>) {
  if (!row) {
    throw new AppError("ESTIMATE_NOT_FOUND");
  }

  return {
    id: row.id,
    price: row.price,
    comment: row.comment,
    status: getSentEstimateDisplayStatus(row.status, row.estimateRequest.status),
    estimateStatus: row.status,
    isDesignated: row.isDesignated,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    customer: row.estimateRequest.customer,
    estimateRequest: {
      id: row.estimateRequest.id,
      moveType: row.estimateRequest.moveType,
      moveDate: row.estimateRequest.moveDate.toISOString(),
      fromZipCode: row.estimateRequest.fromZipCode,
      fromAddress: row.estimateRequest.fromAddress,
      fromDetailAddress: row.estimateRequest.fromDetailAddress,
      fromRegion: row.estimateRequest.fromRegion,
      toZipCode: row.estimateRequest.toZipCode,
      toAddress: row.estimateRequest.toAddress,
      toDetailAddress: row.estimateRequest.toDetailAddress,
      toRegion: row.estimateRequest.toRegion,
      status: row.estimateRequest.status,
      requestedAt: row.estimateRequest.createdAt.toISOString(),
      completedAt: row.estimateRequest.completedAt?.toISOString() ?? null,
    },
  };
}

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
    return mapSentEstimate(row);
  },
};
