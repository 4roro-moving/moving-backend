import { getProfileImageUrl } from "../../utils/image-url";

import type { EstimateRequestDetail } from "./estimateRequest.repository";

export type EstimateRequestResponse = Omit<
  EstimateRequestDetail,
  "designatedMovers" | "rejections" | "estimates"
> & {
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
  request: EstimateRequestDetail,
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
