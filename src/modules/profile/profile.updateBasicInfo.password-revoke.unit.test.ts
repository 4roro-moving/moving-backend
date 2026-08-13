import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import bcrypt from "bcrypt";
import { UserRole } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { authRepository } from "../auth/auth.repository";
import { profileService as customerProfileService } from "./customer/profile.service";
import { profileRepository as customerProfileRepository } from "./customer/profile.repository";
import { profileService as moverProfileService } from "./mover/profile.service";
import { profileRepository as moverProfileRepository } from "./mover/profile.repository";

const CURRENT_PASSWORD = "CurrentPass1!";
const STORED_PASSWORD_HASH = "$2b$10$stored-current-password-hash-for-profile-test";
const NEW_PASSWORD = "NewSecurePass2!";

type Role = "customer" | "mover";

type ProfileService = Pick<typeof customerProfileService, "updateBasicInfo">;
type ProfileRepository = Omit<
  Pick<
    typeof customerProfileRepository,
    | "findUserById"
    | "findProfileByUserId"
    | "findUserWithPasswordById"
    | "hasPasswordByUserId"
    | "updateUser"
  >,
  "findProfileByUserId"
> & {
  findProfileByUserId: (
    userId: string,
    db?: Parameters<typeof customerProfileRepository.findProfileByUserId>[1],
  ) => Promise<unknown>;
};

type TestUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  isProfileCompleted: boolean;
  deletedAt: null;
};

type RoleHarness = {
  role: Role;
  userId: string;
  profileService: ProfileService;
  profileRepository: ProfileRepository;
  user: TestUser;
  profile: {
    id: number;
    userId: string;
    imageUrl: null;
    createdAt: Date;
    updatedAt: Date;
    user: { name: string; email: string; phone: string };
    serviceAreas: [];
    serviceTypes: [];
  };
};

function createHarness(role: Role): RoleHarness {
  const userId = `${role}-user-1`;
  const user: TestUser = {
    id: userId,
    email: `${role}@example.com`,
    name: role === "customer" ? "고객" : "기사",
    phone: "01012345678",
    role: role === "customer" ? UserRole.CUSTOMER : UserRole.MOVER,
    isActive: true,
    isProfileCompleted: true,
    deletedAt: null,
  };

  return {
    role,
    userId,
    profileService: role === "customer" ? customerProfileService : moverProfileService,
    profileRepository: role === "customer" ? customerProfileRepository : moverProfileRepository,
    user,
    profile: {
      id: 1,
      userId,
      imageUrl: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      serviceAreas: [],
      serviceTypes: [],
    },
  };
}

type StubState = {
  passwordUpdates: string[];
  revokeCalls: Array<{ userId: string; sessionType: string }>;
};

function installStubs(harness: RoleHarness, options: { password?: string | null } = {}): StubState {
  const state: StubState = {
    passwordUpdates: [],
    revokeCalls: [],
  };
  const password = options.password === undefined ? STORED_PASSWORD_HASH : options.password;

  harness.profileRepository.findUserById = async () => harness.user;
  harness.profileRepository.findProfileByUserId = async () => harness.profile;
  harness.profileRepository.findUserWithPasswordById = async () => ({
    ...harness.user,
    password,
  });
  harness.profileRepository.hasPasswordByUserId = async () => password !== null;
  harness.profileRepository.updateUser = async (_userId, data) => {
    if (data.password !== undefined) {
      state.passwordUpdates.push(data.password);
    }

    return {
      ...harness.user,
      password: data.password ?? null,
      authProvider: "LOCAL",
      providerUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  authRepository.revokeAllRefreshTokensByUserId = async (userId, sessionType) => {
    state.revokeCalls.push({ userId, sessionType });
    return { count: 0 };
  };

  return state;
}

const originalCustomerFindUserById = customerProfileRepository.findUserById;
const originalCustomerFindProfileByUserId = customerProfileRepository.findProfileByUserId;
const originalCustomerFindUserWithPasswordById = customerProfileRepository.findUserWithPasswordById;
const originalCustomerHasPasswordByUserId = customerProfileRepository.hasPasswordByUserId;
const originalCustomerUpdateUser = customerProfileRepository.updateUser;
const originalMoverFindUserById = moverProfileRepository.findUserById;
const originalMoverFindProfileByUserId = moverProfileRepository.findProfileByUserId;
const originalMoverFindUserWithPasswordById = moverProfileRepository.findUserWithPasswordById;
const originalMoverHasPasswordByUserId = moverProfileRepository.hasPasswordByUserId;
const originalMoverUpdateUser = moverProfileRepository.updateUser;
const originalRevokeAll = authRepository.revokeAllRefreshTokensByUserId;
const originalCompare = bcrypt.compare;

afterEach(() => {
  customerProfileRepository.findUserById = originalCustomerFindUserById;
  customerProfileRepository.findProfileByUserId = originalCustomerFindProfileByUserId;
  customerProfileRepository.findUserWithPasswordById = originalCustomerFindUserWithPasswordById;
  customerProfileRepository.hasPasswordByUserId = originalCustomerHasPasswordByUserId;
  customerProfileRepository.updateUser = originalCustomerUpdateUser;
  moverProfileRepository.findUserById = originalMoverFindUserById;
  moverProfileRepository.findProfileByUserId = originalMoverFindProfileByUserId;
  moverProfileRepository.findUserWithPasswordById = originalMoverFindUserWithPasswordById;
  moverProfileRepository.hasPasswordByUserId = originalMoverHasPasswordByUserId;
  moverProfileRepository.updateUser = originalMoverUpdateUser;
  authRepository.revokeAllRefreshTokensByUserId = originalRevokeAll;
  bcrypt.compare = originalCompare;
});

for (const role of ["customer", "mover"] as const) {
  describe(`${role} updateBasicInfo password validation (unit)`, () => {
    const harness = createHarness(role);

    it("returns UNAUTHORIZED and does not update password or revoke tokens when current password is wrong", async () => {
      const state = installStubs(harness);
      bcrypt.compare = (async () => false) as typeof bcrypt.compare;

      await assert.rejects(
        () =>
          harness.profileService.updateBasicInfo(harness.userId, {
            currentPassword: "wrong-password",
            newPassword: NEW_PASSWORD,
            newPasswordConfirm: NEW_PASSWORD,
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "UNAUTHORIZED" &&
          error.message === "현재 비밀번호가 일치하지 않습니다.",
      );

      assert.equal(state.passwordUpdates.length, 0);
      assert.equal(state.revokeCalls.length, 0);
    });

    it("returns BAD_REQUEST when new password confirmation does not match", async () => {
      const state = installStubs(harness);
      bcrypt.compare = (async () => true) as typeof bcrypt.compare;

      await assert.rejects(
        () =>
          harness.profileService.updateBasicInfo(harness.userId, {
            currentPassword: CURRENT_PASSWORD,
            newPassword: NEW_PASSWORD,
            newPasswordConfirm: "DifferentPass3!",
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "BAD_REQUEST" &&
          error.message === "새 비밀번호가 일치하지 않습니다.",
      );

      assert.equal(state.passwordUpdates.length, 0);
      assert.equal(state.revokeCalls.length, 0);
    });

    it("returns BAD_REQUEST when new password equals current password", async () => {
      const state = installStubs(harness);
      bcrypt.compare = (async () => true) as typeof bcrypt.compare;

      await assert.rejects(
        () =>
          harness.profileService.updateBasicInfo(harness.userId, {
            currentPassword: CURRENT_PASSWORD,
            newPassword: CURRENT_PASSWORD,
            newPasswordConfirm: CURRENT_PASSWORD,
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "BAD_REQUEST" &&
          error.message === "새 비밀번호는 현재 비밀번호와 달라야 합니다.",
      );

      assert.equal(state.passwordUpdates.length, 0);
      assert.equal(state.revokeCalls.length, 0);
    });

    it("returns BAD_REQUEST for social accounts without a stored password", async () => {
      const state = installStubs(harness, { password: null });

      await assert.rejects(
        () =>
          harness.profileService.updateBasicInfo(harness.userId, {
            currentPassword: CURRENT_PASSWORD,
            newPassword: NEW_PASSWORD,
            newPasswordConfirm: NEW_PASSWORD,
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.code === "BAD_REQUEST" &&
          error.message === "비밀번호가 등록되지 않은 계정은 비밀번호를 변경할 수 없습니다.",
      );

      assert.equal(state.passwordUpdates.length, 0);
      assert.equal(state.revokeCalls.length, 0);
    });
  });
}
