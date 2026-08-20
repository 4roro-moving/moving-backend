import { getProfileImageUrl } from "../../../utils/image-url";

import { getReceivedEstimateConfirmState } from "./customer-estimate.policy";

import type { receivedEstimateRepository } from "./customer-estimate.repository";

type ReceivedEstimateListItem = Awaited<
  ReturnType<typeof receivedEstimateRepository.findReceivedEstimatesByEstimateRequestId>
>[number];

type ReceivedEstimateDetailItem = NonNullable<
  Awaited<ReturnType<typeof receivedEstimateRepository.findReceivedEstimateDetailById>>
>;

export function mapListEstimate(estimate: ReceivedEstimateListItem) {
  return {
    id: estimate.id,
    price: estimate.price,
    status: estimate.status,
    isDesignated: estimate.isDesignated,
    createdAt: estimate.createdAt,
    mover: {
      id: estimate.mover.id,
      name: estimate.mover.name,
      nickname: estimate.mover.moverProfile?.nickname ?? null,
      imageUrl: getProfileImageUrl(estimate.mover.moverProfile?.imageUrl ?? null),
      career: estimate.mover.moverProfile?.career ?? 0,
      shortIntro: estimate.mover.moverProfile?.shortIntro ?? null,
      averageRating: Number(estimate.mover.moverProfile?.averageRating ?? 0),
      reviewCount: estimate.mover.moverProfile?.reviewCount ?? 0,
      confirmedCount: estimate.mover.moverProfile?.confirmedCount ?? 0,
      favoriteCount: estimate.mover._count.favoritesReceived,
      isFavorite: estimate.mover.favoritesReceived.length > 0,
    },
  };
}

export function mapDetailEstimate(estimate: ReceivedEstimateDetailItem) {
  const moverProfile = estimate.mover.moverProfile;
  const confirmState = getReceivedEstimateConfirmState({
    estimateId: estimate.id,
    estimateStatus: estimate.status,
    requestStatus: estimate.estimateRequest.status,
    confirmedEstimateId: estimate.estimateRequest.confirmedEstimateId,
  });

  return {
    id: estimate.id,
    price: estimate.price,
    comment: estimate.comment,
    status: estimate.status,
    isDesignated: estimate.isDesignated,
    isConfirmed: confirmState.isConfirmed,
    canConfirm: confirmState.canConfirm,
    confirmDisabledReason: confirmState.confirmDisabledReason,
    createdAt: estimate.createdAt,
    updatedAt: estimate.updatedAt,
    confirmedAt: estimate.confirmedAt,
    estimateRequest: {
      id: estimate.estimateRequest.id,
      moveType: estimate.estimateRequest.moveType,
      moveDate: estimate.moveDate ?? estimate.estimateRequest.moveDate,
      fromZipCode: estimate.estimateRequest.fromZipCode,
      fromAddress: estimate.estimateRequest.fromAddress,
      fromDetailAddress: estimate.estimateRequest.fromDetailAddress,
      fromRegion: estimate.estimateRequest.fromRegion,
      toZipCode: estimate.estimateRequest.toZipCode,
      toAddress: estimate.estimateRequest.toAddress,
      toDetailAddress: estimate.estimateRequest.toDetailAddress,
      toRegion: estimate.estimateRequest.toRegion,
      status: estimate.estimateRequest.status,
      confirmedEstimateId: estimate.estimateRequest.confirmedEstimateId,
    },
    mover: {
      id: estimate.mover.id,
      name: estimate.mover.name,
      nickname: moverProfile?.nickname ?? null,
      imageUrl: getProfileImageUrl(moverProfile?.imageUrl ?? null),
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
}
