import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import bcrypt from "bcrypt";
import { AuthProvider, RefreshTokenSessionType, UserRole } from "@prisma/client";

import "dotenv/config";

import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import { authRepository } from "../auth/auth.repository";
import { authService } from "../auth/auth.service";
import { createRefreshToken } from "../../utils/jwt";
import { tokenHash } from "../../utils/tokenHash";
import { profileService as customerProfileService } from "./customer/profile.service";
import { profileRepository as customerProfileRepository } from "./customer/profile.repository";
import { profileService as moverProfileService } from "./mover/profile.service";
import { profileRepository as moverProfileRepository } from "./mover/profile.repository";

const CURRENT_PASSWORD = "CurrentPass1!";
const NEW_PASSWORD = "NewSecurePass2!";
const PASSWORD_SALT_ROUNDS = 10;

type Role = "customer" | "mover";

type CustomerFixture = {
  role: "customer";
  suffix: string;
  userId: string;
  otherUserId: string;
  email: string;
  loginRole: typeof UserRole.CUSTOMER;
  profileService: typeof customerProfileService;
  profileRepository: typeof customerProfileRepository;
};

type MoverFixture = {
  role: "mover";
  suffix: string;
  userId: string;
  otherUserId: string;
  email: string;
  loginRole: typeof UserRole.MOVER;
  profileService: typeof moverProfileService;
  profileRepository: typeof moverProfileRepository;
};

type Fixture = CustomerFixture | MoverFixture;

async function getOrCreateSeoulRegionId(): Promise<number> {
  const region =
    (await prisma.region.findFirst({ where: { name: "서울" } })) ??
    (await prisma.region.create({
      data: {
        name: `서울-profile-test-${randomUUID().slice(0, 8)}`,
        latitude: 37.5665,
        longitude: 126.978,
      },
    }));

  return region.id;
}

async function createUserWithProfile(role: Role, suffix: string, regionId: number) {
  const email = `${role}-pwd-${suffix}@test.local`;
  const passwordHash = await bcrypt.hash(CURRENT_PASSWORD, PASSWORD_SALT_ROUNDS);
  const uniquePhoneDigits = randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0");

  const user = await prisma.user.create({
    data: {
      email,
      name: role === "customer" ? "비밀번호테스트고객" : "비밀번호테스트기사",
      role: role === "customer" ? UserRole.CUSTOMER : UserRole.MOVER,
      authProvider: AuthProvider.LOCAL,
      password: passwordHash,
      phone: `010${uniquePhoneDigits}`,
      isActive: true,
      isProfileCompleted: true,
      ...(role === "customer"
        ? {
            customerProfile: {
              create: {
                serviceAreas: { create: [{ regionId }] },
                serviceTypes: { create: [{ moveType: "HOME" }] },
              },
            },
          }
        : {
            moverProfile: {
              create: {
                nickname: `mover-${suffix}`,
                career: 3,
                shortIntro: "test intro",
                description: "test description",
                serviceAreas: { create: [{ regionId }] },
                serviceTypes: { create: [{ moveType: "HOME" }] },
              },
            },
          }),
    },
  });

  return { userId: user.id, email };
}

async function createRefreshTokenSession(
  userId: string,
  role: UserRole,
  sessionType: RefreshTokenSessionType,
) {
  const refreshToken = createRefreshToken({ userId, role });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await authRepository.saveRefreshToken({
    userId,
    tokenHash: tokenHash(refreshToken),
    sessionType,
    expiresAt,
  });

  return refreshToken;
}

async function createFixture(role: Role): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const regionId = await getOrCreateSeoulRegionId();
  const primary = await createUserWithProfile(role, suffix, regionId);
  const secondary = await createUserWithProfile(role, `${suffix}-other`, regionId);

  if (role === "customer") {
    return {
      role,
      suffix,
      userId: primary.userId,
      otherUserId: secondary.userId,
      email: primary.email,
      loginRole: UserRole.CUSTOMER,
      profileService: customerProfileService,
      profileRepository: customerProfileRepository,
    };
  }

  return {
    role,
    suffix,
    userId: primary.userId,
    otherUserId: secondary.userId,
    email: primary.email,
    loginRole: UserRole.MOVER,
    profileService: moverProfileService,
    profileRepository: moverProfileRepository,
  };
}

async function cleanupFixture(fixture: Fixture): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: {
      userId: { in: [fixture.userId, fixture.otherUserId] },
    },
  });

  if (fixture.role === "customer") {
    await prisma.customerServiceType.deleteMany({
      where: {
        customerProfile: {
          userId: { in: [fixture.userId, fixture.otherUserId] },
        },
      },
    });
    await prisma.customerServiceArea.deleteMany({
      where: {
        customerProfile: {
          userId: { in: [fixture.userId, fixture.otherUserId] },
        },
      },
    });
    await prisma.customerProfile.deleteMany({
      where: { userId: { in: [fixture.userId, fixture.otherUserId] } },
    });
  } else {
    await prisma.moverServiceType.deleteMany({
      where: {
        moverProfile: {
          userId: { in: [fixture.userId, fixture.otherUserId] },
        },
      },
    });
    await prisma.moverServiceArea.deleteMany({
      where: {
        moverProfile: {
          userId: { in: [fixture.userId, fixture.otherUserId] },
        },
      },
    });
    await prisma.moverProfile.deleteMany({
      where: { userId: { in: [fixture.userId, fixture.otherUserId] } },
    });
  }

  await prisma.user.deleteMany({
    where: { id: { in: [fixture.userId, fixture.otherUserId] } },
  });
}

async function getUserRefreshTokens(userId: string) {
  return prisma.refreshToken.findMany({
    where: { userId, sessionType: RefreshTokenSessionType.USER },
    orderBy: { id: "asc" },
  });
}

async function changePasswordSuccessfully(fixture: Fixture) {
  await fixture.profileService.updateBasicInfo(fixture.userId, {
    currentPassword: CURRENT_PASSWORD,
    newPassword: NEW_PASSWORD,
    newPasswordConfirm: NEW_PASSWORD,
  });
}

function assertUnauthorizedLogin(error: unknown): boolean {
  return error instanceof AppError && error.code === "UNAUTHORIZED";
}

const runDbIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "1";

(runDbIntegration ? describe : describe.skip)(
  "profile updateBasicInfo password revoke (PostgreSQL integration)",
  () => {
    for (const role of ["customer", "mover"] as const) {
      describe(`${role} updateBasicInfo`, () => {
        let fixture: Fixture;

        beforeEach(async () => {
          fixture = await createFixture(role);
        });

        afterEach(async () => {
          await cleanupFixture(fixture);
        });

        it("revokes all active USER refresh token sessions after a successful password change", async () => {
          await createRefreshTokenSession(
            fixture.userId,
            role === "customer" ? UserRole.CUSTOMER : UserRole.MOVER,
            RefreshTokenSessionType.USER,
          );
          await createRefreshTokenSession(
            fixture.userId,
            role === "customer" ? UserRole.CUSTOMER : UserRole.MOVER,
            RefreshTokenSessionType.USER,
          );

          const beforeTokens = await getUserRefreshTokens(fixture.userId);
          assert.ok(beforeTokens.length >= 2);
          assert.ok(beforeTokens.every((token) => token.revokedAt === null));

          await changePasswordSuccessfully(fixture);

          const user = await prisma.user.findUnique({
            where: { id: fixture.userId },
            select: { password: true },
          });

          assert.ok(user?.password);
          assert.equal(await bcrypt.compare(CURRENT_PASSWORD, user.password), false);
          assert.equal(await bcrypt.compare(NEW_PASSWORD, user.password), true);

          const afterTokens = await getUserRefreshTokens(fixture.userId);
          assert.ok(afterTokens.length >= 2);
          assert.ok(afterTokens.every((token) => token.revokedAt !== null));
        });

        it("keeps refresh token sessions when only the name is updated", async () => {
          const refreshToken = await createRefreshTokenSession(
            fixture.userId,
            role === "customer" ? UserRole.CUSTOMER : UserRole.MOVER,
            RefreshTokenSessionType.USER,
          );
          const tokenRecord = await authRepository.findRefreshTokenByHash(
            tokenHash(refreshToken),
            RefreshTokenSessionType.USER,
          );

          assert.ok(tokenRecord);
          const revokedAtBefore = tokenRecord.revokedAt;

          await fixture.profileService.updateBasicInfo(fixture.userId, {
            name: role === "customer" ? "변경된고객" : "변경된기사",
          });

          const tokenAfter = await prisma.refreshToken.findUnique({
            where: { id: tokenRecord.id },
          });

          assert.equal(
            tokenAfter?.revokedAt?.toISOString() ?? null,
            revokedAtBefore?.toISOString() ?? null,
          );
        });

        it("keeps refresh token sessions when only the phone number is updated", async () => {
          const refreshToken = await createRefreshTokenSession(
            fixture.userId,
            role === "customer" ? UserRole.CUSTOMER : UserRole.MOVER,
            RefreshTokenSessionType.USER,
          );
          const tokenRecord = await authRepository.findRefreshTokenByHash(
            tokenHash(refreshToken),
            RefreshTokenSessionType.USER,
          );

          assert.ok(tokenRecord);

          await fixture.profileService.updateBasicInfo(fixture.userId, {
            phone: `010${randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "0")}`,
          });

          const tokenAfter = await prisma.refreshToken.findUnique({
            where: { id: tokenRecord.id },
          });

          assert.equal(tokenAfter?.revokedAt, null);
        });

        it("does not revoke refresh tokens belonging to another user", async () => {
          const otherRefreshToken = await createRefreshTokenSession(
            fixture.otherUserId,
            role === "customer" ? UserRole.CUSTOMER : UserRole.MOVER,
            RefreshTokenSessionType.USER,
          );
          const otherTokenRecord = await authRepository.findRefreshTokenByHash(
            tokenHash(otherRefreshToken),
            RefreshTokenSessionType.USER,
          );

          assert.ok(otherTokenRecord);

          await changePasswordSuccessfully(fixture);

          const otherTokenAfter = await prisma.refreshToken.findUnique({
            where: { id: otherTokenRecord.id },
          });

          assert.equal(otherTokenAfter?.revokedAt, null);
        });

        it("does not revoke non-USER session types for the same user", async () => {
          const adminRefreshToken = await createRefreshTokenSession(
            fixture.userId,
            UserRole.ADMIN,
            RefreshTokenSessionType.ADMIN,
          );
          const adminTokenRecord = await authRepository.findRefreshTokenByHash(
            tokenHash(adminRefreshToken),
            RefreshTokenSessionType.ADMIN,
          );

          assert.ok(adminTokenRecord);

          await changePasswordSuccessfully(fixture);

          const adminTokenAfter = await prisma.refreshToken.findUnique({
            where: { id: adminTokenRecord.id },
          });

          assert.equal(adminTokenAfter?.revokedAt, null);
        });

        it("uses the same transaction client for password update and USER session revoke", async () => {
          const txRefs: unknown[] = [];
          const originalUpdateUser = fixture.profileRepository.updateUser;
          const originalRevokeAll = authRepository.revokeAllRefreshTokensByUserId;

          fixture.profileRepository.updateUser = async (userId, data, tx) => {
            if (data.password !== undefined) {
              txRefs.push(tx);
            }

            return originalUpdateUser(userId, data, tx);
          };

          authRepository.revokeAllRefreshTokensByUserId = async (userId, sessionType, tx) => {
            txRefs.push(tx);
            return originalRevokeAll(userId, sessionType, tx);
          };

          try {
            await changePasswordSuccessfully(fixture);
          } finally {
            fixture.profileRepository.updateUser = originalUpdateUser;
            authRepository.revokeAllRefreshTokensByUserId = originalRevokeAll;
          }

          assert.equal(txRefs.length, 2);
          assert.equal(txRefs[0], txRefs[1]);
        });

        it("rolls back the password update when USER session revoke fails", async () => {
          const originalRevokeAll = authRepository.revokeAllRefreshTokensByUserId;
          const userBefore = await prisma.user.findUnique({
            where: { id: fixture.userId },
            select: { password: true },
          });

          assert.ok(userBefore?.password);

          authRepository.revokeAllRefreshTokensByUserId = async () => {
            throw new Error("forced revoke failure");
          };

          try {
            await assert.rejects(
              () => changePasswordSuccessfully(fixture),
              (error: unknown) =>
                error instanceof Error && error.message === "forced revoke failure",
            );
          } finally {
            authRepository.revokeAllRefreshTokensByUserId = originalRevokeAll;
          }

          const userAfter = await prisma.user.findUnique({
            where: { id: fixture.userId },
            select: { password: true },
          });

          assert.equal(userAfter?.password, userBefore.password);

          const tokens = await getUserRefreshTokens(fixture.userId);
          assert.ok(tokens.every((token) => token.revokedAt === null));
        });

        it("does not revoke refresh tokens when the password update fails inside the transaction", async () => {
          const originalUpdateUser = fixture.profileRepository.updateUser;
          const refreshToken = await createRefreshTokenSession(
            fixture.userId,
            role === "customer" ? UserRole.CUSTOMER : UserRole.MOVER,
            RefreshTokenSessionType.USER,
          );
          const tokenRecord = await authRepository.findRefreshTokenByHash(
            tokenHash(refreshToken),
            RefreshTokenSessionType.USER,
          );

          assert.ok(tokenRecord);

          fixture.profileRepository.updateUser = async (userId, data, tx) => {
            if (data.password !== undefined) {
              throw new Error("forced password update failure");
            }

            return originalUpdateUser(userId, data, tx);
          };

          try {
            await assert.rejects(
              () => changePasswordSuccessfully(fixture),
              (error: unknown) =>
                error instanceof Error && error.message === "forced password update failure",
            );
          } finally {
            fixture.profileRepository.updateUser = originalUpdateUser;
          }

          const tokenAfter = await prisma.refreshToken.findUnique({
            where: { id: tokenRecord.id },
          });

          assert.equal(tokenAfter?.revokedAt, null);
        });

        it("rejects refresh with a token issued before the password change", async () => {
          const oldRefreshToken = await createRefreshTokenSession(
            fixture.userId,
            role === "customer" ? UserRole.CUSTOMER : UserRole.MOVER,
            RefreshTokenSessionType.USER,
          );

          await changePasswordSuccessfully(fixture);

          await assert.rejects(() => authService.refresh(oldRefreshToken), assertUnauthorizedLogin);
        });

        it("allows login with the new password and issues a fresh refresh token", async () => {
          await changePasswordSuccessfully(fixture);

          await assert.rejects(
            () =>
              authService.login({
                email: fixture.email,
                password: CURRENT_PASSWORD,
                role: fixture.loginRole,
              }),
            assertUnauthorizedLogin,
          );

          const loginResult = await authService.login({
            email: fixture.email,
            password: NEW_PASSWORD,
            role: fixture.loginRole,
          });

          assert.equal(typeof loginResult.tokens.refreshToken, "string");

          const storedToken = await authRepository.findRefreshTokenByHash(
            tokenHash(loginResult.tokens.refreshToken),
            RefreshTokenSessionType.USER,
          );

          assert.ok(storedToken);
          assert.equal(storedToken.revokedAt, null);
        });
      });
    }
  },
);
