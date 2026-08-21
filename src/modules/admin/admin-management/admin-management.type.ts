import type { AdminRole } from "@prisma/client";
import type { z } from "zod";

import type {
  adminIdParamSchema,
  createAdminBodySchema,
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
