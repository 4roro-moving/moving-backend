import { getImageUrl } from "../../../utils/image-url";

import type {
  AdminReportRow,
  GiveawayReportTarget,
  MoverReportTarget,
  ResidenceReviewReportTarget,
  ReviewReportTarget,
} from "./reports.repository";
import type {
  AdminGiveawayReportTarget,
  AdminReportDetail,
  AdminMoverReportTarget,
  AdminReportListItem,
  AdminResidenceReviewReportTarget,
  AdminReviewReportTarget,
} from "./reports.type";

export function mapAdminReportListItem(report: AdminReportRow): AdminReportListItem {
  return {
    id: report.id,
    targetType: report.targetType,
    targetId: report.targetId,
    reason: report.reason,
    detail: report.detail,
    status: report.status,

    reporter: {
      id: report.reporter.id,
      name: report.reporter.name,
      email: report.reporter.email,
      role: report.reporter.role,
    },

    handler: report.handler
      ? {
          id: report.handler.id,
          name: report.handler.name,
          email: report.handler.email,
        }
      : null,

    handlerNote: report.handlerNote,
    handledAt: report.handledAt,

    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

export function mapAdminReportDetail(
  report: AdminReportRow & {
    images: {
      id: number;
      imageKey: string;
    }[];
  },
  target: AdminReportDetail["target"],
): AdminReportDetail {
  return {
    ...mapAdminReportListItem(report),
    target,
    images: report.images.map((image) => ({
      id: image.id,
      imageUrl: getImageUrl(image.imageKey) ?? "",
    })),
  };
}

export function mapReviewReportTarget(
  target: NonNullable<ReviewReportTarget>,
): AdminReviewReportTarget {
  return {
    type: "REVIEW",
    id: target.id,
    rating: target.rating,
    content: target.content,
    isHidden: target.isHidden,
    createdAt: target.createdAt,

    author: {
      id: target.customer.id,
      name: target.customer.name,
      email: target.customer.email,
    },

    mover: {
      id: target.mover.id,
      name: target.mover.name,
      nickname: target.mover.moverProfile?.nickname ?? null,
    },
  };
}

export function mapMoverReportTarget(
  target: NonNullable<MoverReportTarget>,
): AdminMoverReportTarget {
  return {
    type: "MOVER",
    id: target.id,
    name: target.name,
    email: target.email,
    nickname: target.moverProfile?.nickname ?? null,
    isActive: target.isActive,
  };
}

export function mapResidenceReviewReportTarget(
  target: NonNullable<ResidenceReviewReportTarget>,
): AdminResidenceReviewReportTarget {
  return {
    type: "RESIDENCE_REVIEW",
    id: target.id,
    title: target.title,
    content: target.content,
    rating: target.rating,
    isHidden: target.isHidden,
    createdAt: target.createdAt,

    author: {
      id: target.author.id,
      name: target.author.name,
      email: target.author.email,
    },

    region: {
      id: target.region.id,
      name: target.region.name,
    },
  };
}

export function mapGiveawayReportTarget(
  target: NonNullable<GiveawayReportTarget>,
): AdminGiveawayReportTarget {
  return {
    type: "GIVEAWAY",
    id: target.id,
    title: target.title,
    description: target.description,
    status: target.status,
    isHidden: target.isHidden,
    createdAt: target.createdAt,

    author: {
      id: target.author.id,
      name: target.author.name,
      email: target.author.email,
    },

    region: target.region
      ? {
          id: target.region.id,
          name: target.region.name,
        }
      : null,

    images: target.images.map((image) => ({
      id: image.id,
      imageKey: image.imageKey,
      sortOrder: image.sortOrder,
    })),
  };
}
