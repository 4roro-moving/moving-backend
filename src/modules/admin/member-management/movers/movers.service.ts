import { UserRole, type Prisma } from "@prisma/client";

import { buildPagination } from "../../../../utils/pagination.util";
import { kstDayEnd, kstDayStart, parseDateMarker } from "../../../../utils/kst";
import { memberRepository } from "../member.repository";
import {
  buildMemberStatusWhere,
  buildProfileCompletedWhere,
  buildMemberListOrderBy,
} from "../member.policy";
import { AppError } from "../../../../lib/app-error";
import { toMoverDetail, toMoverListItem } from "./movers.mapper";
import { moversRepository } from "./movers.repository";
import type { ListMoverQuery, MoverDetail } from "./movers.type";

/**
 * 관리자 기사 목록 query를 Prisma User 조회 조건으로 변환합니다.
 * 역할, 회원 상태, 이름·이메일·닉네임 검색어, 가입일 범위, 기사 전용 지역·이사 유형 필터를 조합합니다.
 */
function buildMoverListWhere(query: ListMoverQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    role: UserRole.MOVER,
    ...buildMemberStatusWhere(query.status),
    ...buildProfileCompletedWhere(query.isProfileCompleted),
  };

  if (query.keyword !== undefined) {
    where.OR = [
      { name: { contains: query.keyword, mode: "insensitive" } },
      { email: { contains: query.keyword, mode: "insensitive" } },
      { moverProfile: { is: { nickname: { contains: query.keyword, mode: "insensitive" } } } },
    ];
  }

  if (query.regionId !== undefined || query.moveType !== undefined) {
    where.moverProfile = {
      is: {
        ...(query.regionId !== undefined
          ? { serviceAreas: { some: { regionId: query.regionId } } }
          : {}),
        ...(query.moveType !== undefined
          ? { serviceTypes: { some: { moveType: query.moveType } } }
          : {}),
      },
    };
  }

  if (query.fromDate || query.toDate) {
    const fromDateMarker = query.fromDate ? parseDateMarker(query.fromDate) : undefined;
    const toDateMarker = query.toDate ? parseDateMarker(query.toDate) : undefined;

    if ((query.fromDate && !fromDateMarker) || (query.toDate && !toDateMarker)) {
      throw new Error("검증된 가입일 범위를 DateMarker로 변환하지 못했습니다.");
    }

    where.createdAt = {
      ...(fromDateMarker ? { gte: kstDayStart(fromDateMarker) } : {}),
      ...(toDateMarker ? { lte: kstDayEnd(toDateMarker) } : {}),
    };
  }

  return where;
}

/** 기사 전용 정렬을 선택한 경우에만 해당 프로필 지표를 우선 정렬합니다. */
function buildMoverListOrderBy(query: ListMoverQuery): Prisma.UserOrderByWithRelationInput[] {
  const defaultOrderBy = buildMemberListOrderBy(query.sort);

  if (query.confirmedSort) {
    return [
      {
        moverProfile: {
          confirmedCount: query.confirmedSort === "CONFIRMED_DESC" ? "desc" : "asc",
        },
      },
      ...defaultOrderBy,
    ];
  }

  if (query.ratingSort) {
    return [
      {
        moverProfile: {
          averageRating: query.ratingSort === "RATING_DESC" ? "desc" : "asc",
        },
      },
      ...defaultOrderBy,
    ];
  }

  if (query.careerSort) {
    return [
      {
        moverProfile: {
          career: query.careerSort === "CAREER_DESC" ? "desc" : "asc",
        },
      },
      ...defaultOrderBy,
    ];
  }

  return defaultOrderBy;
}

export const moversService = {
  /** 관리자용 기사(MOVER) 목록을 조회합니다. */
  async getMoverList(query: ListMoverQuery) {
    const { page, limit, reportSort } = query;

    const { movers, totalCount } = await moversRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      where: buildMoverListWhere(query),
      orderBy: buildMoverListOrderBy(query),
      reportSort,
    });

    return {
      items: movers.map(toMoverListItem),
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  /** 관리자용 기사(MOVER) 상세와 주요 활동 이력을 조회합니다. */
  async getMoverDetail(moverId: string): Promise<MoverDetail> {
    const mover = await moversRepository.findMoverById(moverId);

    if (!mover) {
      throw new AppError("MOVER_NOT_FOUND");
    }

    const [
      inProgressEstimateHistory,
      recentEstimateHistory,
      reviewHistory,
      receivedReports,
      suspensionHistory,
    ] = await Promise.all([
      moversRepository.findInProgressEstimateHistory({ moverId }),
      moversRepository.findRecentEstimateHistory({ moverId }),
      moversRepository.findReviewHistory({ moverId }),
      moversRepository.findReceivedReportHistory({ moverId }),
      memberRepository.findSuspensionHistory({ memberId: moverId }),
    ]);

    return toMoverDetail(mover, {
      inProgressEstimateHistory,
      recentEstimateHistory,
      reviewHistory,
      receivedReports,
      suspensionHistory,
    });
  },
};
