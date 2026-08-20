import { getSentEstimateDisplayStatus } from "./mover-estimate.action-policy";
import type {
  moverEstimateRequestRepository,
  moverSentEstimateRepository,
} from "./mover-estimate.repository";
import type {
  MoverEstimateRequestListItem,
  MoverEstimateRejectionListItem,
} from "./mover-estimate.type";

type EstimateRequestListRow = Awaited<
  ReturnType<typeof moverEstimateRequestRepository.findMany>
>[number];
type EstimateRejectionRow = Awaited<
  ReturnType<typeof moverEstimateRequestRepository.findRejections>
>[number];
type MoverSentEstimateRow = NonNullable<
  Awaited<ReturnType<typeof moverSentEstimateRepository.findDetail>>
>;

export function mapEstimateRequestListItem(
  row: EstimateRequestListRow,
): MoverEstimateRequestListItem {
  return {
    id: row.id,
    customer: row.customer,
    moveType: row.moveType,
    moveDate: row.moveDate.toISOString(),
    fromAddress: row.fromAddress,
    toAddress: row.toAddress,
    fromRegion: row.fromRegion.name,
    toRegion: row.toRegion.name,
    isDesignated: row._count.designatedMovers > 0,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapEstimateRejectionListItem(
  row: EstimateRejectionRow,
): MoverEstimateRejectionListItem {
  return {
    id: row.id,
    reason: row.reason,
    rejectedAt: row.createdAt.toISOString(),
    request: {
      id: row.estimateRequest.id,
      customer: row.estimateRequest.customer,
      moveType: row.estimateRequest.moveType,
      moveDate: row.estimateRequest.moveDate.toISOString(),
      fromAddress: row.estimateRequest.fromAddress,
      toAddress: row.estimateRequest.toAddress,
      fromRegion: row.estimateRequest.fromRegion.name,
      toRegion: row.estimateRequest.toRegion.name,
      isDesignated: row.estimateRequest._count.designatedMovers > 0,
    },
  };
}

export function mapSentEstimate(row: MoverSentEstimateRow) {
  return {
    id: row.id,
    price: row.price,
    comment: row.comment,
    status: getSentEstimateDisplayStatus(row.status, row.estimateRequest.status),
    estimateStatus: row.status,
    isDesignated: row.isDesignated,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    customer: row.estimateRequest.customer,
    estimateRequest: {
      id: row.estimateRequest.id,
      moveType: row.estimateRequest.moveType,
      moveDate: (row.moveDate ?? row.estimateRequest.moveDate).toISOString(),
      fromZipCode: row.estimateRequest.fromZipCode,
      fromAddress: row.estimateRequest.fromAddress,
      fromDetailAddress: row.estimateRequest.fromDetailAddress,
      fromRegion: row.estimateRequest.fromRegion,
      toZipCode: row.estimateRequest.toZipCode,
      toAddress: row.estimateRequest.toAddress,
      toDetailAddress: row.estimateRequest.toDetailAddress,
      toRegion: row.estimateRequest.toRegion,
      status: row.estimateRequest.status,
      requestedAt: row.estimateRequest.createdAt.toISOString(),
      completedAt: row.estimateRequest.completedAt?.toISOString() ?? null,
    },
  };
}
