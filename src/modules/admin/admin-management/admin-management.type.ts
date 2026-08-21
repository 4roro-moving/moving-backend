import type { AdminRole } from "@prisma/client";
import type { z } from "zod";

import type {
  adminIdParamSchema,
  createAdminBodySchema,
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
