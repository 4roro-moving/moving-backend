import {
  AdminRole,
  RefreshTokenRevokedReason,
  RefreshTokenSessionType,
  SuspensionAction,
} from "@prisma/client";

import { AppError } from "../../../lib/app-error";

import { buildPagination } from "../../../utils/pagination.util";
import { hashPassword } from "../../../utils/password";
import { isUniqueConstraintError } from "../../../utils/prisma-error";
import { runTransaction } from "../../../utils/transaction";

import { authRepository } from "../../auth/auth.repository";

import { adminManagementRepository } from "./admin-management.repository";

import type {
  AdminListItem,
  CreateAdminBody,
  CreateAdminResponse,
  ListAdminQuery,
  UpdateAdminStatusBody,
  UpdateAdminStatusResponse,
} from "./admin-management.type";

export const adminManagementService = {
  /**
   * SUPER_ADMIN이 관리할 일반 ADMIN 목록을 조회합니다.
   *
   * SUPER_ADMIN은 목록에서 제외하고,
   * 이름/이메일 검색과 활성 상태 필터를 지원합니다.
   */
  async getAdminList(query: ListAdminQuery) {
    const { page, limit, keyword, status } = query;

    const { admins, totalCount } = await adminManagementRepository.findAdminsWithCount({
      skip: (page - 1) * limit,
      take: limit,
      ...(keyword !== undefined ? { keyword } : {}),
      ...(status !== undefined ? { status } : {}),
    });

    const items: AdminListItem[] = admins.map((admin) => {
      /**
       * Repository에서 AdminRole.ADMIN인 관리자만 조회하므로
       * 정상적인 데이터라면 AdminProfile은 반드시 존재합니다.
       */
      if (!admin.adminProfile) {
        throw new AppError("INTERNAL_SERVER_ERROR", {
          message: "관리자 권한 정보를 확인할 수 없습니다.",
        });
      }

      return {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        phone: admin.phone,
        adminRole: admin.adminProfile.adminRole,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
      };
    });

    return {
      items,
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  /**
   * SUPER_ADMIN이 일반 ADMIN 계정을 생성합니다.
   *
   * role과 adminRole은 외부 입력으로 받지 않고,
   * Repository에서 각각 ADMIN으로 고정합니다.
   */
  async createAdmin(input: CreateAdminBody): Promise<CreateAdminResponse> {
    /**
     * Validator에서 email/phone 정규화를 수행하므로
     * Service에서는 검증된 값을 그대로 사용합니다.
     */
    const { email, password, name, phone } = input;

    /**
     * 빠른 중복 응답을 위한 사전 조회입니다.
     *
     * 이 검사만으로 동시 요청을 완전히 막을 수 없으므로
     * DB UNIQUE 제약과 P2002 처리도 함께 사용합니다.
     */
    const existingUser = await adminManagementRepository.findUserByEmail(email);

    if (existingUser) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 이메일입니다.",
      });
    }

    const existingPhone = await adminManagementRepository.findUserByPhone(phone);

    if (existingPhone) {
      throw new AppError("CONFLICT", {
        message: "이미 사용 중인 전화번호입니다.",
      });
    }

    /**
     * bcrypt 연산은 트랜잭션 밖에서 처리합니다.
     * DB 커넥션 점유 시간을 줄이기 위함입니다.
     */
    const hashedPassword = await hashPassword(password);

    try {
      return await runTransaction(async (tx) => {
        /**
         * User와 AdminProfile은 하나의 관리자 계정을 구성하므로
         * 동일 트랜잭션에서 생성합니다.
         */
        const user = await adminManagementRepository.createAdminUser(
          {
            email,
            password: hashedPassword,
            name,
            phone,
          },
          tx,
        );

        const adminProfile = await adminManagementRepository.createAdminProfile(user.id, tx);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          role: "ADMIN",
          adminRole: adminProfile.adminRole,
          isActive: user.isActive,
          createdAt: user.createdAt,
        };
      });
    } catch (error) {
      /**
       * 동일 이메일의 관리자 생성 요청이 동시에 들어온 경우
       * DB UNIQUE 제약조건에 의해 하나만 성공합니다.
       */
      if (isUniqueConstraintError(error, "email")) {
        throw new AppError("CONFLICT", {
          message: "이미 사용 중인 이메일입니다.",
        });
      }

      /**
       * 전화번호 역시 UNIQUE이므로
       * 동시 요청 충돌을 동일하게 처리합니다.
       */
      if (isUniqueConstraintError(error, "phone")) {
        throw new AppError("CONFLICT", {
          message: "이미 사용 중인 전화번호입니다.",
        });
      }

      throw error;
    }
  },

  /**
   * SUPER_ADMIN이 일반 ADMIN 계정을 정지하거나 해제합니다.
   *
   * SUPER_ADMIN 계정 자체는 상태 변경 대상이 될 수 없습니다.
   * 정지 시 기존 ADMIN Refresh Token 세션을 모두 강제 폐기합니다.
   * 정지 해제 시 기존 세션은 복구하지 않으며 다시 로그인해야 합니다.
   */
  async updateAdminStatus({
    targetAdminId,
    actorAdminId,
    input,
  }: {
    targetAdminId: string;
    actorAdminId: string;
    input: UpdateAdminStatusBody;
  }): Promise<UpdateAdminStatusResponse> {
    return runTransaction(async (tx) => {
      /**
       * 상태 변경 대상이 실제 관리자 계정인지 확인하고,
       * AdminProfile을 통해 내부 관리자 역할도 함께 확인합니다.
       */
      const admin = await adminManagementRepository.findAdminById(targetAdminId, tx);

      if (!admin || !admin.adminProfile) {
        throw new AppError("USER_NOT_FOUND", {
          message: "해당 관리자 계정을 찾을 수 없습니다.",
        });
      }

      /**
       * SUPER_ADMIN은 일반 관리자 계정 관리 API의
       * 상태 변경 대상이 될 수 없습니다.
       */
      if (admin.adminProfile.adminRole !== AdminRole.ADMIN) {
        throw new AppError("FORBIDDEN", {
          message: "SUPER_ADMIN 계정의 상태는 변경할 수 없습니다.",
        });
      }

      const shouldBeActive = input.action === SuspensionAction.RELEASE;

      /**
       * 현재 상태와 동일한 상태 변경 요청은 중복 처리하지 않습니다.
       */
      if (admin.isActive === shouldBeActive) {
        throw new AppError("CONFLICT", {
          message: shouldBeActive
            ? "이미 활성화된 관리자 계정입니다."
            : "이미 정지된 관리자 계정입니다.",
        });
      }

      /**
       * 관리자 계정의 실제 활성 상태를 변경합니다.
       *
       * 현재 정지 여부의 기준은 User.isActive입니다.
       */
      const updatedAdmin = await adminManagementRepository.updateAdminActiveStatus(
        targetAdminId,
        shouldBeActive,
        tx,
      );

      /**
       * 누가 어떤 관리자를 어떤 사유로 정지/해제했는지
       * UserSuspension 이력으로 저장합니다.
       */
      await adminManagementRepository.createAdminSuspensionHistory(
        {
          userId: targetAdminId,
          adminId: actorAdminId,
          action: input.action,
          reason: input.reason,
        },
        tx,
      );

      /**
       * 관리자 상태 변경은 운영상 추적이 필요한 행위이므로
       * ActivityLog에도 기록합니다.
       */
      await adminManagementRepository.createAdminStatusActivityLog(
        {
          actorId: actorAdminId,
          targetId: targetAdminId,
          memo: input.reason,
        },
        tx,
      );

      /**
       * 관리자 계정을 정지하는 경우
       * 기존 ADMIN Refresh Token 세션을 모두 강제로 폐기합니다.
       *
       * 기존 Access Token은 requireActiveAdmin이 매 요청마다
       * DB의 isActive를 확인하므로 이후 요청부터 차단됩니다.
       */
      if (!shouldBeActive) {
        await authRepository.revokeAllRefreshTokensByUserId(
          targetAdminId,
          RefreshTokenSessionType.ADMIN,
          RefreshTokenRevokedReason.FORCED,
          tx,
        );
      }

      return {
        id: updatedAdmin.id,
        isActive: updatedAdmin.isActive,
        adminRole: admin.adminProfile.adminRole,
      };
    });
  },
};
