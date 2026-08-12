import { UserRole, type Prisma } from "@prisma/client";

import { buildPagination } from "../../../../utils/pagination.util";
import { toKstEndOfDay, toKstStartOfDay } from "../member-list-date.util";
import { buildMemberStatusWhere, buildProfileCompletedWhere } from "../member.policy";
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
    where.createdAt = {
      ...(query.fromDate ? { gte: toKstStartOfDay(query.fromDate) } : {}),
      ...(query.toDate ? { lte: toKstEndOfDay(query.toDate) } : {}),
    };
  }

  return where;
}

export const moversService = {
  /** 관리자용 기사(MOVER) 목록을 조회합니다. */
  async getMoverList(query: ListMoverQuery) {
    const { page, limit } = query;

    const { movers, totalCount } = await moversRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      where: buildMoverListWhere(query),
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
      moversRepository.findSuspensionHistory({ moverId }),
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
