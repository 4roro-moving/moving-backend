import {
  AdminRole,
  AuthProvider,
  LogAction,
  LogTargetType,
  UserRole,
  type SuspensionAction,
} from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

type CreateAdminUserData = {
  email: string;
  password: string;
  name: string;
  phone: string;
};

type CreateAdminSuspensionHistoryData = {
  userId: string;
  adminId: string;
  action: SuspensionAction;
  reason: string;
};

type CreateAdminStatusActivityLogData = {
  actorId: string;
  targetId: string;
  memo: string;
};

export const adminManagementRepository = {
  /**
   * 이메일 기준으로 기존 사용자 존재 여부를 확인합니다.
   */
  findUserByEmail(email: string, db: DbClient = prisma) {
    return db.user.findUnique({
      where: { email },
      select: {
        id: true,
      },
    });
  },

  /**
   * 휴대전화 번호 기준으로 기존 사용자 존재 여부를 확인합니다.
   */
  findUserByPhone(phone: string, db: DbClient = prisma) {
    return db.user.findUnique({
      where: { phone },
      select: {
        id: true,
      },
    });
  },

  /**
   * 일반 관리자 User 계정을 생성합니다.
   *
   * 외부 입력으로 role을 받지 않고,
   * 서버에서 UserRole.ADMIN으로 고정합니다.
   */
  createAdminUser(data: CreateAdminUserData, db: DbClient = prisma) {
    return db.user.create({
      data: {
        email: data.email,
        password: data.password,
        name: data.name,
        phone: data.phone,
        authProvider: AuthProvider.LOCAL,
        providerUserId: null,
        role: UserRole.ADMIN,
        isActive: true,
        isProfileCompleted: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  },

  /**
   * 생성된 ADMIN User에 일반 관리자 프로필을 연결합니다.
   *
   * SUPER_ADMIN은 이 API를 통해 생성하지 않으므로,
   * AdminRole.ADMIN으로 고정합니다.
   */
  createAdminProfile(userId: string, db: DbClient = prisma) {
    return db.adminProfile.create({
      data: {
        userId,
        adminRole: AdminRole.ADMIN,
      },
      select: {
        adminRole: true,
      },
    });
  },

  /**
   * 관리자 상태 변경에 필요한 대상 관리자 정보를 조회합니다.
   *
   * User.role = ADMIN인 계정만 조회하며,
   * AdminProfile을 함께 조회해 SUPER_ADMIN 여부를 확인할 수 있도록 합니다.
   */
  findAdminById(id: string, db: DbClient = prisma) {
    return db.user.findFirst({
      where: {
        id,
        role: UserRole.ADMIN,
        deletedAt: null,
      },
      select: {
        id: true,
        isActive: true,
        adminProfile: {
          select: {
            adminRole: true,
          },
        },
      },
    });
  },

  /**
   * 관리자의 활성 상태를 변경합니다.
   *
   * 현재 관리자 정지 상태의 기준은 User.isActive입니다.
   */
  updateAdminActiveStatus(id: string, isActive: boolean, db: DbClient = prisma) {
    return db.user.update({
      where: {
        id,
      },
      data: {
        isActive,
      },
      select: {
        id: true,
        isActive: true,
        adminProfile: {
          select: {
            adminRole: true,
          },
        },
      },
    });
  },

  /**
   * 관리자 정지/해제 이력을 저장합니다.
   *
   * 현재 상태 자체는 User.isActive에서 관리하고,
   * UserSuspension에는 누가 누구를 어떤 사유로
   * 정지 또는 해제했는지를 이력으로 남깁니다.
   */
  createAdminSuspensionHistory(data: CreateAdminSuspensionHistoryData, db: DbClient = prisma) {
    return db.userSuspension.create({
      data: {
        userId: data.userId,
        adminId: data.adminId,
        action: data.action,
        reason: data.reason,
      },
    });
  },

  /**
   * 관리자 상태 변경에 대한 ActivityLog를 저장합니다.
   *
   * actorId에는 작업을 수행한 SUPER_ADMIN,
   * targetId에는 상태가 변경된 ADMIN의 User ID를 기록합니다.
   *
   * 관리자 역시 User이므로 targetType은 USER를 사용합니다.
   */
  createAdminStatusActivityLog(data: CreateAdminStatusActivityLogData, db: DbClient = prisma) {
    return db.activityLog.create({
      data: {
        actorId: data.actorId,
        actorRole: UserRole.ADMIN,
        action: LogAction.UPDATE,
        targetType: LogTargetType.USER,
        targetId: data.targetId,
        memo: data.memo,
      },
    });
  },
};
