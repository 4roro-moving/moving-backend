import { estimateRepository } from "../repositories/estimate.repository";
import { ApiError } from "../utils/ApiError";

type GetReceivedEstimateListParams = {
  estimateRequestId: number;
  customerId: string;
};

export const estimateService = {
  async getReceivedEstimateList({ estimateRequestId, customerId }: GetReceivedEstimateListParams) {
    const estimateRequest = await estimateRepository.findEstimateRequestById(estimateRequestId);

    if (!estimateRequest) {
      throw new ApiError("NOT_FOUND", {
        message: "견적 요청을 찾을 수 없습니다.",
      });
    }

    if (estimateRequest.customerId !== customerId) {
      throw new ApiError("FORBIDDEN", {
        message: "본인의 견적 요청만 조회할 수 있습니다.",
      });
    }

    const estimates =
      await estimateRepository.findReceivedEstimatesByEstimateRequestId(estimateRequestId);

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
