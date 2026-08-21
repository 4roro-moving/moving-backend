import type { AdminRole, SuspensionAction } from "@prisma/client";

import type { z } from "zod";

import type {
  adminIdParamSchema,
  createAdminBodySchema,
  deactivateAdminBodySchema,
  listAdminQuerySchema,
  updateAdminStatusBodySchema,
} from "./admin-management.validator";

export type CreateAdminBody = z.infer<typeof createAdminBodySchema>;

export type CreateAdminResponse = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: "ADMIN";
  adminRole: AdminRole;
  isActive: boolean;
  createdAt: Date;
};

export type AdminIdParam = z.infer<typeof adminIdParamSchema>;

export type UpdateAdminStatusBody = z.infer<typeof updateAdminStatusBodySchema>;

export type UpdateAdminStatusResponse = {
  id: string;
  isActive: boolean;
  adminRole: AdminRole;
};

/**
 * 관리자 목록 조회 Query Parameter
 */
export type ListAdminQuery = z.infer<typeof listAdminQuerySchema>;

/**
 * 관리자 목록의 개별 관리자 정보
 */
export type AdminListItem = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  adminRole: AdminRole;
  isActive: boolean;
  createdAt: Date;
};

export type AdminSuspensionHistoryItem = {
  id: number;
  action: SuspensionAction;
  reason: string;
  adminId: string;
  createdAt: Date;
};

export type AdminDetail = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  adminRole: AdminRole;
  isActive: boolean;
  createdAt: Date;
  suspensionHistory: {
    totalCount: number;
    items: AdminSuspensionHistoryItem[];
  };
};

/**
 * 일반 ADMIN 계정 비활성화 요청
 *
 * 비활성화 사유는 ActivityLog에 기록하기 위해 사용합니다.
 */
export type DeactivateAdminBody = z.infer<typeof deactivateAdminBodySchema>;

/**
 * 일반 ADMIN 계정 비활성화 응답
 *
 * 비활성화된 관리자는 더 이상 활성 계정이 아니며,
 * deletedAt을 통해 계정 사용 종료 시점을 관리합니다.
 */
export type DeactivateAdminResponse = {
  id: string;
  adminRole: AdminRole;
  isActive: boolean;
  deletedAt: Date;
};
