import type { MoveType } from "@prisma/client";

import { ApiError } from "../../utils/ApiError";
import { moverEstimateRequestRepository } from "./mover-estimate-request.repository";
import type {
  MoverEstimateRequestListItem,
  MoverEstimateRequestListQuery,
  MoverEstimateRequestListResult,
} from "./mover-estimate-request.type";

/* 
2026.07.22 add 윤소정
-기사 프로필 확인
-조회 조건 정리
-레퍼지토리 호출
-DB 결과 API 응답 형태로 가공
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
      throw new ApiError("MOVER_NOT_FOUND");
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
    const rows = await moverEstimateRequestRepository.findMany({
      moverId,
      moverMoveTypes,
      moverRegionIds,
      query,
      cursorId,
    });

    const hasNextPage = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const items: MoverEstimateRequestListItem[] = [];

    for (const row of pageRows) {
      const isDesignated = row.designatedMovers.some((designation) => {
        return designation.moverId === moverId;
      });

      items.push({
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
      });
    }

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
      },
    };
  },
};
