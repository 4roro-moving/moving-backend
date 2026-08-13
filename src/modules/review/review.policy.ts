import { EstimateRequestStatus, EstimateStatus } from "@prisma/client";

import { AppError } from "../../lib/app-error";

type ReviewCreationEligibility = {
  customerId: string;
  estimateRequestCustomerId: string;
  estimateStatus: EstimateStatus;
  estimateRequestStatus: EstimateRequestStatus;
  hasReview: boolean;
  hasMoverProfile: boolean;
};

export function assertReviewCreatable({
  customerId,
  estimateRequestCustomerId,
  estimateStatus,
  estimateRequestStatus,
  hasReview,
  hasMoverProfile,
}: ReviewCreationEligibility) {
  if (estimateRequestCustomerId !== customerId) {
    throw new AppError("FORBIDDEN", {
      message: "본인의 견적에만 리뷰를 작성할 수 있습니다.",
    });
  }

  if (estimateStatus !== EstimateStatus.CONFIRMED) {
    throw new AppError("BAD_REQUEST", {
      message: "확정된 견적에만 리뷰를 작성할 수 있습니다.",
    });
  }

  if (estimateRequestStatus !== EstimateRequestStatus.COMPLETED) {
    throw new AppError("BAD_REQUEST", {
      message: "서비스 이용이 완료된 견적에만 리뷰를 작성할 수 있습니다.",
    });
  }

  if (hasReview) {
    throw new AppError("CONFLICT", {
      message: "이미 리뷰를 작성한 견적입니다.",
    });
  }

  if (!hasMoverProfile) {
    throw new AppError("BAD_REQUEST", {
      message: "기사님 프로필이 없어 리뷰를 작성할 수 없습니다.",
    });
  }
}
