import type { EstimateRequestStatus, EstimateStatus, MoveType, Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";
import { runTransaction } from "../../utils/transaction";
import { notificationService } from "../notification/notification.service";
import { moverEstimateRequestRepository, receivedEstimateRepository } from "./estimate.repository";
import type {
  ConfirmReceivedEstimateParams,
  GetReceivedEstimateDetailParams,
  GetReceivedEstimateListParams,
  MoverEstimateRequestListItem,
  MoverEstimateRequestListQuery,
  MoverEstimateRequestListResult,
  PendingEstimateQuery,
  RejectEstimateParams,
  SendEstimateParams,
} from "./estimate.type";

/* 
2026.07.22 add 윤소정
-기사 프로필 확인
-조회 조건 정리
-레퍼지토리 호출
-DB 결과 API 응답 형태로 가공
*/

/*
2026.07.23 add 김성현
- 받은 견적 목록 비즈니스 로직
- 받은 견적 상세 비즈니스 로직
- 받은 견적 확정 비즈니스 로직
*/

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// =============================================================================
// 기사: 고객의 견적 요청 목록 조회
// =============================================================================

function getKstEndOfDay(date: Date): Date {
  const kstDate = new Date(date.getTime() + KST_OFFSET_MS);

  return new Date(
    Date.UTC(
      kstDate.getUTCFullYear(),
      kstDate.getUTCMonth(),
      kstDate.getUTCDate(),
      14,
      59,
      59,
      999,
    ),
  );
}

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

  //견적 제안
  async sendEstimate({ estimateRequestId, moverId, input }: SendEstimateParams) {
    return runTransaction(async (tx) => {
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

      //견적 셍성
      return moverEstimateRequestRepository.createEstimate(
        {
          estimateRequestId,
          moverId,
          price: input.price,
          comment: input.comment,
          isDesignated,
        },
        tx,
      );
    });
  },

  // 견적 요청 반려
  async rejectEstimate({ estimateRequestId, moverId, input }: RejectEstimateParams) {
    return runTransaction(async (tx) => {
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

      //견적 요청이 OPEN이고, 활성 상태인지 확인
      if (
        estimateRequest.status !== "OPEN" ||
        !estimateRequest.isActive ||
        estimateRequest.confirmedEstimateId !== null
      ) {
        //이미 확정된 요청인지 확인
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
      return moverEstimateRequestRepository.createEstimateRejection(
        {
          estimateRequestId,
          moverId,
          reason: input.reason,
        },
        tx,
      );
    });
  },
};

// =============================================================================
// 고객: 기사에게 받은 견적 목록·상세 조회 및 견적 확정
// =============================================================================

// 2026.07.24 정슬기 - [추가] 확정 불가 사유를 FE disabled 안내에 전달
function getConfirmDisabledReason(
  estimateStatus: EstimateStatus,
  requestStatus: EstimateRequestStatus,
  isConfirmed: boolean,
): string | null {
  if (isConfirmed) {
    return null;
  }

  if (estimateStatus === "SENT" && requestStatus === "OPEN") {
    return null;
  }

  // 2026.07.24 정슬기 - [예외 처리] 같은 요청에 확정 견적이 있으면 추가 확정 차단 안내
  if (
    estimateStatus === "SENT" &&
    (requestStatus === "CONFIRMED" || requestStatus === "COMPLETED")
  ) {
    return "이미 확정된 견적이 있어 추가로 확정할 수 없습니다.";
  }

  if (estimateStatus === "CONFIRMED") {
    return null;
  }

  return "확정할 수 없는 견적입니다.";
}

// 2026.07.24 정슬기 - [수정] 목록 응답에 찜 여부·찜 수를 포함
function mapListEstimate(estimate: {
  id: number;
  price: number;
  status: EstimateStatus;
  isDesignated: boolean;
  createdAt: Date;
  mover: {
    id: string;
    name: string;
    moverProfile: {
      nickname: string | null;
      imageUrl: string | null;
      career: number;
      shortIntro: string | null;
      averageRating: Prisma.Decimal | number;
      reviewCount: number;
      confirmedCount: number;
    } | null;
    favoritesReceived: { id: number }[];
    _count: { favoritesReceived: number };
  };
}) {
  return {
    id: estimate.id,
    price: estimate.price,
    status: estimate.status,
    isDesignated: estimate.isDesignated,
    createdAt: estimate.createdAt,
    mover: {
      id: estimate.mover.id,
      name: estimate.mover.name,
      nickname: estimate.mover.moverProfile?.nickname ?? null,
      imageUrl: estimate.mover.moverProfile?.imageUrl ?? null,
      career: estimate.mover.moverProfile?.career ?? 0,
      shortIntro: estimate.mover.moverProfile?.shortIntro ?? null,
      averageRating: Number(estimate.mover.moverProfile?.averageRating ?? 0),
      reviewCount: estimate.mover.moverProfile?.reviewCount ?? 0,
      confirmedCount: estimate.mover.moverProfile?.confirmedCount ?? 0,
      favoriteCount: estimate.mover._count.favoritesReceived,
      isFavorite: estimate.mover.favoritesReceived.length > 0,
    },
  };
}

function mapDetailEstimate(
  estimate: NonNullable<
    Awaited<ReturnType<typeof receivedEstimateRepository.findReceivedEstimateDetailById>>
  >,
) {
  const moverProfile = estimate.mover.moverProfile;
  // 2026.07.24 정슬기 - [추가] 상세 응답에 확정 여부·추가 확정 가능 여부 포함
  const isConfirmed = estimate.estimateRequest.confirmedEstimateId === estimate.id;
  const canConfirm = estimate.status === "SENT" && estimate.estimateRequest.status === "OPEN";

  return {
    id: estimate.id,
    price: estimate.price,
    comment: estimate.comment,
    status: estimate.status,
    isDesignated: estimate.isDesignated,
    isConfirmed,
    canConfirm,
    confirmDisabledReason: getConfirmDisabledReason(
      estimate.status,
      estimate.estimateRequest.status,
      isConfirmed,
    ),
    createdAt: estimate.createdAt,
    updatedAt: estimate.updatedAt,
    confirmedAt: estimate.confirmedAt,
    estimateRequest: {
      id: estimate.estimateRequest.id,
      moveType: estimate.estimateRequest.moveType,
      moveDate: estimate.estimateRequest.moveDate,
      fromZipCode: estimate.estimateRequest.fromZipCode,
      fromAddress: estimate.estimateRequest.fromAddress,
      fromDetailAddress: estimate.estimateRequest.fromDetailAddress,
      fromRegion: estimate.estimateRequest.fromRegion,
      toZipCode: estimate.estimateRequest.toZipCode,
      toAddress: estimate.estimateRequest.toAddress,
      toDetailAddress: estimate.estimateRequest.toDetailAddress,
      toRegion: estimate.estimateRequest.toRegion,
      status: estimate.estimateRequest.status,
      confirmedEstimateId: estimate.estimateRequest.confirmedEstimateId,
    },
    mover: {
      id: estimate.mover.id,
      name: estimate.mover.name,
      nickname: moverProfile?.nickname ?? null,
      imageUrl: moverProfile?.imageUrl ?? null,
      career: moverProfile?.career ?? 0,
      shortIntro: moverProfile?.shortIntro ?? null,
      description: moverProfile?.description ?? null,
      averageRating: Number(moverProfile?.averageRating ?? 0),
      reviewCount: moverProfile?.reviewCount ?? 0,
      confirmedCount: moverProfile?.confirmedCount ?? 0,
      favoriteCount: estimate.mover._count.favoritesReceived,
      isFavorite: estimate.mover.favoritesReceived.length > 0,
      serviceTypes: moverProfile?.serviceTypes.map((serviceType) => serviceType.moveType) ?? [],
      serviceAreas:
        moverProfile?.serviceAreas.map((serviceArea) => ({
          id: serviceArea.region.id,
          name: serviceArea.region.name,
        })) ?? [],
    },
  };
}

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
    //견적 요청 조회
    const estimateRequest =
      await receivedEstimateRepository.findEstimateRequestById(estimateRequestId);

    if (!estimateRequest) {
      throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
    }

    //견적 요청 소유자 확인
    if (estimateRequest.customerId !== customerId) {
      throw new AppError("FORBIDDEN", {
        message: "본인의 견적 요청만 조회할 수 있습니다.",
      });
    }

    //받은 견적 목록 조회
    const estimates = await receivedEstimateRepository.findReceivedEstimatesByEstimateRequestId(
      estimateRequestId,
      customerId,
    );

    //목록 응답 형태 가공
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

    //견적 요청 소유자 확인
    if (estimate.estimateRequest.customerId !== customerId) {
      throw new AppError("FORBIDDEN", {
        message: "본인의 견적 요청에 도착한 견적만 조회할 수 있습니다.",
      });
    }

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

      //견적 요청 소유자 확인
      if (estimate.estimateRequest.customerId !== customerId) {
        throw new AppError("FORBIDDEN", {
          message: "본인의 견적 요청에 도착한 견적만 확정할 수 있습니다.",
        });
      }

      if (estimate.estimateRequest.status !== "OPEN") {
        throw new AppError("CONFLICT", {
          message: "확정할 수 없는 견적 요청 상태입니다.",
        });
      }

      if (estimate.estimateRequest.confirmedEstimateId !== null) {
        throw new AppError("CONFLICT", {
          message: "이미 확정된 견적 요청입니다.",
        });
      }

      if (estimate.status !== "SENT") {
        throw new AppError("CONFLICT", {
          message: "확정할 수 없는 견적 상태입니다.",
        });
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

      //확정 응답 형태 가공
      return {
        estimateRequest: confirmedEstimateRequest,
        moveDate: estimate.estimateRequest.moveDate,
        estimate: {
          id: confirmedEstimate.id,
          price: confirmedEstimate.price,
          status: confirmedEstimate.status,
          confirmedAt: confirmedEstimate.confirmedAt,
          mover: {
            id: confirmedEstimate.mover.id,
            name: confirmedEstimate.mover.name,
            nickname: confirmedEstimate.mover.moverProfile?.nickname ?? null,
            imageUrl: confirmedEstimate.mover.moverProfile?.imageUrl ?? null,
          },
        },
        expiredEstimateCount: expiredEstimates.count,
      };
    });

    await notificationService.createNotification({
      userId: result.estimate.mover.id,
      type: "ESTIMATE_CONFIRMED",
      title: "견적 확정",
      content: "고객님이 회원님의 견적을 확정했습니다.",
      linkUrl: "/estimate/received-requests",
      expiresAt: getKstEndOfDay(result.moveDate),
    });

    return result;
  },
};
