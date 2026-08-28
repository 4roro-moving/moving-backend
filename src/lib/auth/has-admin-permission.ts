import type { AdminRole } from "@prisma/client";

import type { AdminPermission } from "./admin-permissions";
import { ADMIN_ROLE_PERMISSIONS } from "./admin-role-permissions";

export function hasAdminPermission(adminRole: AdminRole, permission: AdminPermission): boolean {
  return ADMIN_ROLE_PERMISSIONS[adminRole].includes(permission);
}
