import { EstimateStatus } from "@prisma/client";

import { resolveMemberStatus } from "../member.policy";
import type {
  InProgressEstimateRow,
  MoverDetailRow,
  MoverListRow,
  MoverReportHistoryRow,
  MoverReviewHistoryRow,
  MoverSuspensionHistoryRow,
  RecentEstimateRow,
  moversRepository,
} from "./movers.repository";
import type { MoverDetail, MoverListItem } from "./movers.type";

export function toMoverListItem(mover: MoverListRow): MoverListItem {
  const profile = mover.moverProfile;

  return {
    id: mover.id,
    email: mover.email,
    name: mover.name,
    nickname: profile?.nickname ?? null,
    career: profile?.career ?? 0,
    status: resolveMemberStatus(mover),
    isProfileCompleted: mover.isProfileCompleted,
    averageRating: Number(profile?.averageRating ?? 0),
    reviewCount: profile?.reviewCount ?? 0,
    confirmedCount: profile?.confirmedCount ?? 0,
    serviceAreas: profile?.serviceAreas.map((area) => area.region.name) ?? [],
    serviceTypes: profile?.serviceTypes.map((type) => type.moveType) ?? [],
    createdAt: mover.createdAt,
  };
}

function toInProgressEstimateItem(item: InProgressEstimateRow) {
  return {
    id: item.id,
    estimateRequestId: item.estimateRequestId,
    status: item.status,
    price: item.price,
    moveDate: item.estimateRequest.moveDate,
    // 관리자 개별 취소 API의 대상은 확정(CONFIRMED) 거래입니다.
    cancelable: item.status === EstimateStatus.CONFIRMED,
    createdAt: item.createdAt,
  };
}

function toRecentEstimateItem(item: RecentEstimateRow) {
  return {
    id: item.id,
    status: item.status,
    price: item.price,
    confirmedAt: item.confirmedAt,
  };
}

function toReviewHistoryItem(item: MoverReviewHistoryRow) {
  return {
    id: item.id,
    customerId: item.customerId,
    rating: item.rating,
    content: item.content,
    isHidden: item.isHidden,
    createdAt: item.createdAt,
  };
}

function toReceivedReportHistoryItem(item: MoverReportHistoryRow) {
  return {
    id: item.id,
    reason: item.reason,
    status: item.status,
    createdAt: item.createdAt,
  };
}

function toSuspensionHistoryItem(item: MoverSuspensionHistoryRow) {
  return {
    id: item.id,
    action: item.action,
    reason: item.reason,
    createdAt: item.createdAt,
  };
}

type MoverDetailHistories = {
  inProgressEstimateHistory: Awaited<
    ReturnType<typeof moversRepository.findInProgressEstimateHistory>
  >;
  recentEstimateHistory: Awaited<ReturnType<typeof moversRepository.findRecentEstimateHistory>>;
  reviewHistory: Awaited<ReturnType<typeof moversRepository.findReviewHistory>>;
  receivedReports: Awaited<ReturnType<typeof moversRepository.findReceivedReportHistory>>;
  suspensionHistory: Awaited<ReturnType<typeof moversRepository.findSuspensionHistory>>;
};

export function toMoverDetail(mover: MoverDetailRow, histories: MoverDetailHistories): MoverDetail {
  const profile = mover.moverProfile;

  return {
    account: {
      id: mover.id,
      email: mover.email,
      name: mover.name,
      phone: mover.phone,
      authProvider: mover.authProvider,
      status: resolveMemberStatus(mover),
      isProfileCompleted: mover.isProfileCompleted,
      createdAt: mover.createdAt,
      updatedAt: mover.updatedAt,
    },
    profile: {
      nickname: profile?.nickname ?? null,
      imageUrl: profile?.imageUrl ?? null,
      career: profile?.career ?? 0,
      shortIntro: profile?.shortIntro ?? null,
      description: profile?.description ?? null,
      averageRating: Number(profile?.averageRating ?? 0),
      reviewCount: profile?.reviewCount ?? 0,
      confirmedCount: profile?.confirmedCount ?? 0,
      serviceAreas: profile?.serviceAreas.map((area) => area.region.name) ?? [],
      serviceTypes: profile?.serviceTypes.map((type) => type.moveType) ?? [],
    },
    estimateActivity: {
      inProgress: {
        totalCount: histories.inProgressEstimateHistory.totalCount,
        items: histories.inProgressEstimateHistory.items.map(toInProgressEstimateItem),
      },
      recent: {
        totalCount: histories.recentEstimateHistory.totalCount,
        items: histories.recentEstimateHistory.items.map(toRecentEstimateItem),
      },
    },
    reviewHistory: {
      totalCount: histories.reviewHistory.totalCount,
      items: histories.reviewHistory.items.map(toReviewHistoryItem),
    },
    reportHistory: {
      received: {
        totalCount: histories.receivedReports.totalCount,
        items: histories.receivedReports.items.map(toReceivedReportHistoryItem),
      },
    },
    suspensionHistory: {
      totalCount: histories.suspensionHistory.totalCount,
      items: histories.suspensionHistory.items.map(toSuspensionHistoryItem),
    },
  };
}
