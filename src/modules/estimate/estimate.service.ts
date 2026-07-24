import type { MoveType } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { moverEstimateRequestRepository, receivedEstimateRepository } from "./estimate.repository";
import type {
  GetReceivedEstimateDetailParams,
  GetReceivedEstimateListParams,
  MoverEstimateRequestListItem,
  MoverEstimateRequestListQuery,
  MoverEstimateRequestListResult,
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
*/

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
};

export const receivedEstimateService = {
  async getReceivedEstimateList({ estimateRequestId, customerId }: GetReceivedEstimateListParams) {
    //견적 요청 조회
    const estimateRequest =
      await receivedEstimateRepository.findEstimateRequestById(estimateRequestId);

    if (!estimateRequest) {
      throw new AppError("NOT_FOUND", {
        message: "견적 요청을 찾을 수 없습니다.",
      });
    }

    //견적 요청 소유자 확인
    if (estimateRequest.customerId !== customerId) {
      throw new AppError("FORBIDDEN", {
        message: "본인의 견적 요청만 조회할 수 있습니다.",
      });
    }

    //받은 견적 목록 조회
    const estimates =
      await receivedEstimateRepository.findReceivedEstimatesByEstimateRequestId(estimateRequestId);

    //목록 응답 형태 가공
    return {
      estimateRequest: {
        id: estimateRequest.id,
        moveType: estimateRequest.moveType,
        moveDate: estimateRequest.moveDate,
        fromAddress: estimateRequest.fromAddress,
        toAddress: estimateRequest.toAddress,
        status: estimateRequest.status,
      },
      estimates: estimates.map((estimate) => ({
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
        },
      })),
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
      throw new AppError("NOT_FOUND", {
        message: "견적을 찾을 수 없습니다.",
      });
    }

    //견적 요청 소유자 확인
    if (estimate.estimateRequest.customerId !== customerId) {
      throw new AppError("FORBIDDEN", {
        message: "본인의 견적 요청에 도착한 견적만 조회할 수 있습니다.",
      });
    }

    //기사 프로필 정보 분리
    const moverProfile = estimate.mover.moverProfile;

    //상세 응답 형태 가공
    return {
      id: estimate.id,
      price: estimate.price,
      comment: estimate.comment,
      status: estimate.status,
      isDesignated: estimate.isDesignated,
      isConfirmed: estimate.estimateRequest.confirmedEstimateId === estimate.id,
      canConfirm: estimate.status === "SENT" && estimate.estimateRequest.status === "OPEN",
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
  },
};
