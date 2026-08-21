import { prisma } from "../../../lib/prisma";
import type { DbClient } from "../../../utils/transaction";

/**
 * 관리자 로그인 검증용 사용자 조회
 *
 * 비밀번호 검증이 필요하므로 password를 포함한다.
 * 로그인에 필요한 필드만 조회해 불필요한 데이터 노출을 줄인다.
 */
const findByEmailForLogin = async (email: string, db: DbClient = prisma) => {
  return db.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
      email: true,
      password: true,
      name: true,
      role: true,
      authProvider: true,
      isActive: true,
      deletedAt: true,
    },
  });
};

/**
 * 관리자 세션 및 활성 상태 검증용 사용자 조회
 *
 * Refresh, /me, requireActiveAdmin에서는 비밀번호가 필요하지 않으므로
 * password와 기타 민감한 인증 필드를 조회하지 않는다.
 */
const findByIdForSession = async (id: string, db: DbClient = prisma) => {
  return db.user.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      deletedAt: true,
      createdAt: true,
      adminProfile: {
        select: {
          adminRole: true,
        },
      },
    },
  });
};

export const adminAuthRepository = {
  findByEmailForLogin,
  findByIdForSession,
};
