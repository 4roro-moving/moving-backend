import type { MoveType } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { moverEstimateRequestRepository, receivedEstimateRepository } from "./estimate.repository";
import type {
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
받은 견적 목록 비즈니스 로직
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

    //목록 조회 요청
    const repositoryParams = {
      moverId,
      moverMoveTypes,
      moverRegionIds,
      query,
      cursorId,
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
    const estimateRequest =
      await receivedEstimateRepository.findEstimateRequestById(estimateRequestId);

    if (!estimateRequest) {
      throw new AppError("NOT_FOUND", {
        message: "견적 요청을 찾을 수 없습니다.",
      });
    }

    if (estimateRequest.customerId !== customerId) {
      throw new AppError("FORBIDDEN", {
        message: "본인의 견적 요청만 조회할 수 있습니다.",
      });
    }

    const estimates =
      await receivedEstimateRepository.findReceivedEstimatesByEstimateRequestId(estimateRequestId);

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
};
