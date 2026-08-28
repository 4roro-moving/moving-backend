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

type CreateAdminDeactivateActivityLogData = {
  actorId: string;
  targetId: string;
  memo: string;
};

type FindAdminsWithCountParams = {
  skip: number;
  take: number;
  keyword?: string;
  status?: "ACTIVE" | "SUSPENDED";
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
   * 일반 ADMIN 목록과 전체 개수를 조회합니다.
   *
   * - User.role = ADMIN인 계정만 조회합니다.
   * - AdminProfile.adminRole = ADMIN 조건을 통해
   *   SUPER_ADMIN은 관리 대상 목록에서 제외합니다.
   * - deletedAt이 null인 관리자만 조회합니다.
   * - keyword가 있으면 이름 또는 이메일을 부분 일치 검색합니다.
   * - status는 User.isActive 기준으로 필터링합니다.
   * - 최신 생성된 관리자부터 조회합니다.
   */
  async findAdminsWithCount(
    { skip, take, keyword, status }: FindAdminsWithCountParams,
    db: DbClient = prisma,
  ) {
    const where = {
      role: UserRole.ADMIN,
      deletedAt: null,
      adminProfile: {
        is: {
          adminRole: AdminRole.ADMIN,
        },
      },
      ...(keyword
        ? {
            OR: [
              {
                name: {
                  contains: keyword,
                  mode: "insensitive" as const,
                },
              },
              {
                email: {
                  contains: keyword,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
      ...(status
        ? {
            isActive: status === "ACTIVE",
          }
        : {}),
    };

    const [admins, totalCount] = await Promise.all([
      db.user.findMany({
        where,
        skip,
        take,
        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "asc",
          },
        ],
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          isActive: true,
          createdAt: true,
          adminProfile: {
            select: {
              adminRole: true,
            },
          },
        },
      }),

      db.user.count({
        where,
      }),
    ]);

    return {
      admins,
      totalCount,
    };
  },

  /**
   * 일반 ADMIN 상세 정보를 조회합니다.
   *
   * 관리자 계정 관리 대상인 AdminRole.ADMIN만 조회하며,
   * SUPER_ADMIN과 비활성화된 관리자는 상세 조회 대상에서 제외합니다.
   */
  findAdminDetailById(id: string, db: DbClient = prisma) {
    return db.user.findFirst({
      where: {
        id,
        role: UserRole.ADMIN,
        deletedAt: null,
        adminProfile: {
          is: {
            adminRole: AdminRole.ADMIN,
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        isActive: true,
        createdAt: true,
        adminProfile: {
          select: {
            adminRole: true,
          },
        },
      },
    });
  },

  /**
   * 일반 ADMIN의 정지/해제 이력을 조회합니다.
   *
   * 상세 화면에서는 최근 5건만 노출하지만,
   * 전체 이력 개수도 함께 반환합니다.
   */
  async findAdminSuspensionHistory(adminId: string, db: DbClient = prisma) {
    const [items, totalCount] = await Promise.all([
      db.userSuspension.findMany({
        where: {
          userId: adminId,
        },
        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        take: 5,
        select: {
          id: true,
          action: true,
          reason: true,
          adminId: true,
          createdAt: true,
        },
      }),

      db.userSuspension.count({
        where: {
          userId: adminId,
        },
      }),
    ]);

    return {
      items,
      totalCount,
    };
  },

  /**
   * 관리자 상태 변경 또는 비활성화에 필요한 대상 관리자 정보를 조회합니다.
   *
   * User.role = ADMIN인 계정만 조회하며,
   * AdminProfile을 함께 조회해 SUPER_ADMIN 여부를 확인할 수 있도록 합니다.
   *
   * SUPER_ADMIN 여부는 Service에서 명시적으로 판단해야 하므로
   * 여기서는 AdminRole.ADMIN으로 제한하지 않습니다.
   *
   * 이미 비활성화된 관리자도 Service에서 중복 비활성화를 판단할 수 있도록
   * deletedAt 조건을 두지 않습니다.
   */
  findAdminById(id: string, db: DbClient = prisma) {
    return db.user.findFirst({
      where: {
        id,
        role: UserRole.ADMIN,
      },
      select: {
        id: true,
        isActive: true,
        deletedAt: true,
        adminProfile: {
          select: {
            adminRole: true,
          },
        },
      },
    });
  },

  /**
   * 관리자의 활성 상태를 조건부로 변경합니다.
   *
   * Service에서 조회한 현재 상태와 DB의 실제 상태가 동일할 때만
   * 변경하도록 하여 동일 상태 변경 요청의 동시 처리를 방지합니다.
   *
   * deletedAt = null 조건을 함께 확인하여
   * 비활성화된 관리자 계정이 다시 변경되지 않도록 합니다.
   *
   * count가 0이면 다른 요청에 의해 이미 상태가 변경되었거나
   * 비활성화된 상태임을 의미합니다.
   */
  updateAdminActiveStatus(
    id: string,
    currentIsActive: boolean,
    nextIsActive: boolean,
    db: DbClient = prisma,
  ) {
    return db.user.updateMany({
      where: {
        id,
        isActive: currentIsActive,
        deletedAt: null,
      },
      data: {
        isActive: nextIsActive,
      },
    });
  },

  /**
   * 일반 ADMIN 계정을 조건부로 비활성화합니다.
   *
   * 비활성화는 일시적인 정지와 구분합니다.
   *
   * - isActive = false
   * - deletedAt = 비활성화 시각
   *
   * 실제 User 데이터를 삭제하지 않는 Soft Delete 방식입니다.
   *
   * Service에서 조회한 isActive 상태와
   * DB의 현재 isActive 상태가 동일하고,
   * deletedAt이 null인 경우에만 변경합니다.
   *
   * 따라서 동일 관리자에 대한 중복 비활성화 요청이나
   * 정지/해제와 비활성화가 동시에 처리되는 상황을 방지합니다.
   */
  deactivateAdmin(id: string, currentIsActive: boolean, deletedAt: Date, db: DbClient = prisma) {
    return db.user.updateMany({
      where: {
        id,
        isActive: currentIsActive,
        deletedAt: null,
      },
      data: {
        isActive: false,
        deletedAt,
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

  /**
   * 일반 ADMIN 비활성화 행위를 ActivityLog에 기록합니다.
   *
   * actorId에는 비활성화를 수행한 SUPER_ADMIN,
   * targetId에는 비활성화된 ADMIN의 User ID를 기록합니다.
   *
   * User 자체는 Soft Delete되지만 실제 데이터는 남아 있으므로
   * 운영상 누가 어떤 사유로 계정을 비활성화했는지 추적할 수 있습니다.
   */
  createAdminDeactivateActivityLog(
    data: CreateAdminDeactivateActivityLogData,
    db: DbClient = prisma,
  ) {
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
