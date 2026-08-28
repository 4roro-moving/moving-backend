import { getProfileImageUrl } from "../../utils/image-url";

import type { EstimateRequestDetail, EstimateRequestListItem } from "./estimateRequest.repository";

export type EstimateRequestResponse = Omit<
  EstimateRequestDetail,
  "designatedMovers" | "rejections" | "estimates"
> & {
  _count: { estimates: number };
  designatedMovers: Array<
    EstimateRequestDetail["designatedMovers"][number] & {
      hasEstimate: boolean;
      rejection: {
        reason: string;
        rejectedAt: Date;
      } | null;
    }
  >;
};

export function mapEstimateRequestProfileImageUrls(
  request: EstimateRequestDetail | EstimateRequestListItem,
): EstimateRequestResponse {
  const { rejections, designatedMovers, estimates, ...rest } = request;

  const rejectionByMoverId = new Map(
    rejections.map((rejection) => [
      rejection.moverId,
      {
        reason: rejection.reason,
        rejectedAt: rejection.createdAt,
      },
    ]),
  );

  const estimatedMoverIds = new Set(estimates.map((estimate) => estimate.moverId));

  return {
    ...rest,
    // _count 는 estimates 상관 서브쿼리를 유발해 목록 조회가 3.3초 걸렸다.
    // estimates 를 이미 전량 조회하므로 길이로 대체한다.
    // 주의: estimates select 에 where 를 추가하면 이 등가가 깨진다.
    _count: { estimates: estimates.length },
    designatedMovers: designatedMovers.map((designatedMover) => ({
      ...designatedMover,
      mover: {
        ...designatedMover.mover,
        moverProfile: designatedMover.mover.moverProfile
          ? {
              ...designatedMover.mover.moverProfile,
              imageUrl: getProfileImageUrl(designatedMover.mover.moverProfile.imageUrl),
            }
          : null,
      },
      rejection: rejectionByMoverId.get(designatedMover.moverId) ?? null,
      hasEstimate: estimatedMoverIds.has(designatedMover.moverId),
    })),
  };
}
