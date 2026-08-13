import { buildPagination } from "../../../../utils/pagination.util";
import { memberRepository } from "../member.repository";
import { AppError } from "../../../../lib/app-error";
import { toMoverDetail, toMoverListItem } from "./movers.mapper";
import { moversRepository } from "./movers.repository";
import type { ListMoverQuery, MoverDetail } from "./movers.type";

export const moversService = {
  /** 관리자용 기사(MOVER) 목록을 조회합니다. */
  async getMoverList(query: ListMoverQuery) {
    const { page, limit } = query;

    const sorts = query.sorts?.length ? query.sorts : ["CREATED_AT_DESC"];

    const { movers, totalCount } = await moversRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      sorts,
      filters: query,
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
