import type { Prisma } from "@prisma/client";

import { buildPagination } from "../../../../utils/pagination.util";

import { customersRepository, type CustomerListRow } from "./customers.repository";
import type { CustomerListItem, CustomerStatus, ListCustomerQuery } from "./customers.type";

/**
 * KST(Asia/Seoul) 달력 날짜의 시작 시각을 UTC로 변환합니다.
 * DB의 createdAt은 UTC timestamp로 저장되므로, 관리자 화면의 날짜 기준에 맞춰 조회 범위만 UTC로 변환합니다.
 */
export function toKstStartOfDay(date: string): Date {
  const [year = NaN, month = NaN, day = NaN] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, -9));
}

/** KST 달력 날짜의 마지막 시각을 UTC로 변환합니다. */
export function toKstEndOfDay(date: string): Date {
  const [year = NaN, month = NaN, day = NaN] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day, 14, 59, 59, 999));
}

/**
 * isActive + deletedAt 조합으로 회원 상태를 계산합니다.
 * - ACTIVE: deletedAt = null AND isActive = true
 * - SUSPENDED: deletedAt = null AND isActive = false
 * - WITHDRAWN: deletedAt != null
 */
export function resolveCustomerStatus(user: {
  isActive: boolean;
  deletedAt: Date | null;
}): CustomerStatus {
  if (user.deletedAt !== null) {
    return "WITHDRAWN";
  }

  return user.isActive ? "ACTIVE" : "SUSPENDED";
}

function buildStatusWhere(status: CustomerStatus | undefined): Prisma.UserWhereInput {
  if (status === "ACTIVE") {
    return { deletedAt: null, isActive: true };
  }

  if (status === "SUSPENDED") {
    return { deletedAt: null, isActive: false };
  }

  if (status === "WITHDRAWN") {
    return { deletedAt: { not: null } };
  }

  // 미지정 시 탈퇴 회원(WITHDRAWN) 제외
  return { deletedAt: null };
}

function buildCustomerListWhere(query: ListCustomerQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    role: "CUSTOMER",
    ...buildStatusWhere(query.status),
  };

  if (query.keyword !== undefined) {
    where.OR = [
      { name: { contains: query.keyword, mode: "insensitive" } },
      { email: { contains: query.keyword, mode: "insensitive" } },
    ];
  }

  if (query.fromDate || query.toDate) {
    where.createdAt = {
      ...(query.fromDate ? { gte: toKstStartOfDay(query.fromDate) } : {}),
      ...(query.toDate ? { lte: toKstEndOfDay(query.toDate) } : {}),
    };
  }

  return where;
}

function toCustomerListItem(customer: CustomerListRow): CustomerListItem {
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

export const customersService = {
  /**
   * 관리자용 일반 고객(CUSTOMER) 목록을 조회합니다.
   * status 미지정 시 탈퇴 회원은 제외되며, createdAt DESC 로 정렬됩니다.
   */
  async getCustomerList(query: ListCustomerQuery) {
    const { page, limit } = query;

    const { customers, totalCount } = await customersRepository.findManyWithCount({
      skip: (page - 1) * limit,
      take: limit,
      where: buildCustomerListWhere(query),
    });

    return {
      items: customers.map(toCustomerListItem),
      pagination: buildPagination(totalCount, page, limit),
    };
  },
};
