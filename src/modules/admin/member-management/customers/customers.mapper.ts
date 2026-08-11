import { MEMBER_STATUS, type MemberStatus } from "../member-status.constants";
import type {
  CustomerDetailRow,
  CustomerListRow,
  EstimateHistoryRow,
  ReportHistoryRow,
  ReviewHistoryRow,
  SuspensionHistoryRow,
  customersRepository,
} from "./customers.repository";
import type { CustomerDetail, CustomerListItem } from "./customers.type";

function resolveCustomerStatus(user: { isActive: boolean; deletedAt: Date | null }): MemberStatus {
  if (user.deletedAt !== null) {
    return MEMBER_STATUS.WITHDRAWN;
  }

  return user.isActive ? MEMBER_STATUS.ACTIVE : MEMBER_STATUS.SUSPENDED;
}

export function toCustomerListItem(customer: CustomerListRow): CustomerListItem {
  return {
    id: customer.id,
    email: customer.email,
    name: customer.name,
    phone: customer.phone,
    status: resolveCustomerStatus(customer),
    isProfileCompleted: customer.isProfileCompleted,
    createdAt: customer.createdAt,
  };
}

function toEstimateHistoryItem(item: EstimateHistoryRow) {
  return {
    id: item.id,
    moveType: item.moveType,
    status: item.status,
    moveDate: item.moveDate,
    createdAt: item.createdAt,
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

function toSuspensionHistoryItem(item: SuspensionHistoryRow) {
  return {
    id: item.id,
    action: item.action,
    reason: item.reason,
    createdAt: item.createdAt,
  };
}

type CustomerDetailHistories = {
  estimateHistory: Awaited<ReturnType<typeof customersRepository.findEstimateHistory>>;
  reviewHistory: Awaited<ReturnType<typeof customersRepository.findReviewHistory>>;
  filedReports: Awaited<ReturnType<typeof customersRepository.findFiledReportHistory>>;
  receivedReports: Awaited<ReturnType<typeof customersRepository.findReceivedReportHistory>>;
  suspensionHistory: Awaited<ReturnType<typeof customersRepository.findSuspensionHistory>>;
};

export function toCustomerDetail(
  customer: CustomerDetailRow,
  histories: CustomerDetailHistories,
): CustomerDetail {
  const profile = customer.customerProfile;

  return {
    account: {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      authProvider: customer.authProvider,
      status: resolveCustomerStatus(customer),
      isProfileCompleted: customer.isProfileCompleted,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    },
    profile: {
      imageUrl: profile?.imageUrl ?? null,
      serviceAreas: profile?.serviceAreas.map((area) => area.region.name) ?? [],
      serviceTypes: profile?.serviceTypes.map((type) => type.moveType) ?? [],
    },
    estimateHistory: {
      totalCount: histories.estimateHistory.totalCount,
      items: histories.estimateHistory.items.map(toEstimateHistoryItem),
    },
    reviewHistory: {
      totalCount: histories.reviewHistory.totalCount,
      items: histories.reviewHistory.items.map(toReviewHistoryItem),
    },
    reportHistory: {
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
      items: histories.suspensionHistory.items.map(toSuspensionHistoryItem),
    },
  };
}
