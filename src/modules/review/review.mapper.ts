import { getProfileImageUrl } from "../../utils/image-url";
import type { MoverReviewRow, MyReviewRow, ReviewableEstimateRow } from "./review.repository";

function maskEmailLocalPart(email: string) {
  const localPart = email.split("@")[0] ?? "";

  if (localPart.length <= 1) {
    return `${localPart}*`;
  }

  if (localPart.length === 2) {
    return `${localPart[0]}*`;
  }

  return `${localPart.slice(0, 2)}${"*".repeat(localPart.length - 2)}`;
}

export function mapMoverReview(review: MoverReviewRow) {
  const estimateRequest = review.estimate.estimateRequest;

  return {
    id: review.id,
    rating: review.rating,
    content: review.content,
    createdAt: review.createdAt,
    customer: {
      id: review.customer.id,
      displayName: maskEmailLocalPart(review.customer.email),
      imageUrl: getProfileImageUrl(review.customer.customerProfile?.imageUrl ?? null),
    },
    estimateRequest: {
      id: estimateRequest.id,
      moveType: estimateRequest.moveType,
      moveDate: estimateRequest.moveDate,
    },
  };
}

export function mapMyReview(review: MyReviewRow) {
  const moverProfile = review.mover.moverProfile;
  const estimateRequest = review.estimate.estimateRequest;

  return {
    id: review.id,
    estimateId: review.estimateId,
    rating: review.rating,
    content: review.content,
    createdAt: review.createdAt,
    price: review.estimate.price,
    estimateRequest: {
      id: estimateRequest.id,
      moveType: estimateRequest.moveType,
      moveDate: estimateRequest.moveDate,
      fromAddress: estimateRequest.fromAddress,
      toAddress: estimateRequest.toAddress,
    },
    mover: {
      id: review.mover.id,
      name: review.mover.name,
      nickname: moverProfile?.nickname ?? null,
      imageUrl: getProfileImageUrl(moverProfile?.imageUrl ?? null),
      shortIntro: moverProfile?.shortIntro ?? null,
    },
  };
}

export function mapReviewableEstimate(estimate: ReviewableEstimateRow) {
  const moverProfile = estimate.mover.moverProfile;

  return {
    estimateId: estimate.id,
    price: estimate.price,
    confirmedAt: estimate.confirmedAt,
    estimateRequest: {
      id: estimate.estimateRequest.id,
      moveType: estimate.estimateRequest.moveType,
      moveDate: estimate.estimateRequest.moveDate,
      fromAddress: estimate.estimateRequest.fromAddress,
      toAddress: estimate.estimateRequest.toAddress,
      status: estimate.estimateRequest.status,
    },
    mover: {
      id: estimate.mover.id,
      nickname: moverProfile?.nickname ?? null,
      imageUrl: getProfileImageUrl(moverProfile?.imageUrl ?? null),
      career: moverProfile?.career ?? null,
      averageRating: moverProfile ? Number(moverProfile.averageRating) : null,
      reviewCount: moverProfile?.reviewCount ?? null,
    },
  };
}
