import { EstimateRequestStatus, EstimateStatus, UserRole } from "@prisma/client";

import {
  toMemberDetailAccount,
  toMemberInquiryHistoryItem,
  toMemberListBase,
  toMemberSuspensionHistoryItem,
} from "../member.mapper";
import type { memberRepository } from "../member.repository";
import type {
  CustomerDetailRow,
  CustomerListRow,
  EstimateHistoryRow,
  ReportHistoryRow,
  ReviewHistoryRow,
  customersRepository,
} from "./customers.repository";
import type { CustomerDetail, CustomerListItem } from "./customers.type";

export function toCustomerListItem(customer: CustomerListRow): CustomerListItem {
  return {
    ...toMemberListBase(customer),
    authProvider: customer.authProvider,
  };
}

function toEstimateHistoryItem(item: EstimateHistoryRow) {
  const estimateStatusCounts = item.estimates.reduce(
    (counts, estimate) => {
      counts[estimate.status] += 1;
      return counts;
    },
    {
      [EstimateStatus.SENT]: 0,
      [EstimateStatus.CONFIRMED]: 0,
      [EstimateStatus.EXPIRED]: 0,
      [EstimateStatus.CANCELED]: 0,
    },
  );

  const confirmedEstimate = item.confirmedEstimate;
  const canceledByRole = item.histories[0]?.changedByUser.role;

  return {
    id: item.id,
    moveType: item.moveType,
    status: item.status,
    moveDate: item.moveDate,
    expiresAt: item.expiresAt,
    expiredAt: item.expiredAt,
    canceledAt: item.canceledAt,
    canceledBy:
      item.status === EstimateRequestStatus.CANCELED &&
      (canceledByRole === UserRole.CUSTOMER || canceledByRole === UserRole.ADMIN)
        ? canceledByRole
        : null,
    completedAt: item.completedAt,
    createdAt: item.createdAt,
    estimateSummary: {
      totalCount: item.estimates.length,
      sentCount: estimateStatusCounts[EstimateStatus.SENT],
      confirmedCount: estimateStatusCounts[EstimateStatus.CONFIRMED],
      expiredCount: estimateStatusCounts[EstimateStatus.EXPIRED],
      canceledCount: estimateStatusCounts[EstimateStatus.CANCELED],
    },
    confirmedEstimate: confirmedEstimate
      ? {
          id: confirmedEstimate.id,
          mover: {
            id: confirmedEstimate.moverId,
            name: confirmedEstimate.mover.name,
            nickname: confirmedEstimate.mover.moverProfile?.nickname ?? null,
          },
          price: confirmedEstimate.price,
          confirmedAt: confirmedEstimate.confirmedAt,
          cancelable:
            item.status === EstimateRequestStatus.CONFIRMED &&
            item.isActive &&
            item.confirmedEstimateId === confirmedEstimate.id,
        }
      : null,
  };
}

function toReviewHistoryItem(item: ReviewHistoryRow) {
  return {
    id: item.id,
    moverId: item.moverId,
    moverNickname: item.mover.moverProfile?.nickname ?? item.mover.name,
    rating: item.rating,
    content: item.content,
    isHidden: item.isHidden,
    createdAt: item.createdAt,
  };
}

function toReportHistoryItem(item: ReportHistoryRow) {
  return {
    id: item.id,
    targetType: item.targetType,
    targetId: item.targetId,
    reason: item.reason,
    status: item.status,
    createdAt: item.createdAt,
  };
}

type CustomerDetailHistories = {
  estimateHistory: Awaited<ReturnType<typeof customersRepository.findEstimateHistory>>;
  reviewHistory: Awaited<ReturnType<typeof customersRepository.findReviewHistory>>;
  filedReports: Awaited<ReturnType<typeof customersRepository.findFiledReportHistory>>;
  receivedReports: Awaited<ReturnType<typeof customersRepository.findReceivedReportHistory>>;
  suspensionHistory: Awaited<ReturnType<typeof memberRepository.findSuspensionHistory>>;
  inquiryHistory: Awaited<ReturnType<typeof memberRepository.findInquiryHistory>>;
};

export function toCustomerDetail(
  customer: CustomerDetailRow,
  histories: CustomerDetailHistories,
): CustomerDetail {
  // 프로필을 등록하지 않은 고객은 null/빈 배열로 반환
  const profile = customer.customerProfile;

  return {
    account: toMemberDetailAccount(customer),
    profile: {
      imageUrl: profile?.imageUrl ?? null,
      serviceAreas: profile?.serviceAreas.map((area) => area.region.name) ?? [],
      serviceTypes: profile?.serviceTypes.map((type) => type.moveType) ?? [],
    },
    estimateRequests: {
      totalCount: histories.estimateHistory.totalCount,
      items: histories.estimateHistory.items.map(toEstimateHistoryItem),
    },
    reviewHistory: {
      totalCount: histories.reviewHistory.totalCount,
      items: histories.reviewHistory.items.map(toReviewHistoryItem),
    },
    reportHistory: {
      // filed: 고객이 신고한 내역, received: 고객이 작성한 리뷰가 신고된 내역
      filed: {
        totalCount: histories.filedReports.totalCount,
        items: histories.filedReports.items.map(toReportHistoryItem),
      },
      received: {
        totalCount: histories.receivedReports.totalCount,
        items: histories.receivedReports.items.map(toReportHistoryItem),
      },
    },
    suspensionHistory: {
      totalCount: histories.suspensionHistory.totalCount,
      items: histories.suspensionHistory.items.map(toMemberSuspensionHistoryItem),
    },
    inquiryHistory: {
      totalCount: histories.inquiryHistory.totalCount,
      openCount: histories.inquiryHistory.openCount,
      items: histories.inquiryHistory.items.map(toMemberInquiryHistoryItem),
    },
  };
}
