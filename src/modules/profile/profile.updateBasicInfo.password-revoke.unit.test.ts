import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import bcrypt from "bcrypt";
import { AuthProvider, Prisma, UserRole } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { authRepository } from "../auth/auth.repository";
import { profileRepository as customerProfileRepository } from "./customer/profile.repository";
import { profileService as customerProfileService } from "./customer/profile.service";
import { profileRepository as moverProfileRepository } from "./mover/profile.repository";
import { profileService as moverProfileService } from "./mover/profile.service";

const CURRENT_PASSWORD = "CurrentPass1!";
const STORED_PASSWORD_HASH = "$2b$10$stored-current-password-hash-for-profile-test";
const NEW_PASSWORD = "NewSecurePass2!";

type Role = "customer" | "mover";

type CustomerUser = NonNullable<Awaited<ReturnType<typeof customerProfileRepository.findUserById>>>;
type CustomerUserWithPassword = NonNullable<
  Awaited<ReturnType<typeof customerProfileRepository.findUserWithPasswordById>>
>;
type CustomerUpdatedUser = Awaited<ReturnType<typeof customerProfileRepository.updateUser>>;
type CustomerProfileRecord = NonNullable<
  Awaited<ReturnType<typeof customerProfileRepository.findProfileByUserId>>
>;

type MoverUser = NonNullable<Awaited<ReturnType<typeof moverProfileRepository.findUserById>>>;
type MoverUserWithPassword = NonNullable<
  Awaited<ReturnType<typeof moverProfileRepository.findUserWithPasswordById>>
>;
type MoverUpdatedUser = Awaited<ReturnType<typeof moverProfileRepository.updateUser>>;
type MoverProfileRecord = NonNullable<
  Awaited<ReturnType<typeof moverProfileRepository.findProfileByUserId>>
>;

type CustomerHarness = {
  role: "customer";
  userId: string;
  profileService: typeof customerProfileService;
  profileRepository: typeof customerProfileRepository;
  user: CustomerUser;
  userWithPassword: CustomerUserWithPassword;
  updatedUser: CustomerUpdatedUser;
  profile: CustomerProfileRecord;
};

type MoverHarness = {
  role: "mover";
  userId: string;
  profileService: typeof moverProfileService;
  profileRepository: typeof moverProfileRepository;
  user: MoverUser;
  userWithPassword: MoverUserWithPassword;
  updatedUser: MoverUpdatedUser;
  profile: MoverProfileRecord;
};

type RoleHarness = CustomerHarness | MoverHarness;

function createHarness(role: "customer"): CustomerHarness;
function createHarness(role: "mover"): MoverHarness;
function createHarness(role: Role): RoleHarness {
  const userId = `${role}-user-1`;
  const baseUser = {
    id: userId,
    email: `${role}@example.com`,
    name: role === "customer" ? "고객" : "기사",
    phone: "01012345678",
    role: role === "customer" ? UserRole.CUSTOMER : UserRole.MOVER,
    isActive: true,
    isProfileCompleted: true,
    deletedAt: null,
  };

  if (role === "customer") {
    const user: CustomerUser = baseUser;
    const userWithPassword: CustomerUserWithPassword = {
      ...user,
      password: STORED_PASSWORD_HASH,
    };
    const updatedUser: CustomerUpdatedUser = {
      ...userWithPassword,
      authProvider: AuthProvider.LOCAL,
      providerUserId: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    };
    const profile: CustomerProfileRecord = {
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
    };

    return {
      role,
      userId,
      profileService: customerProfileService,
      profileRepository: customerProfileRepository,
      user,
      userWithPassword,
      updatedUser,
      profile,
    };
  }

  const user: MoverUser = baseUser;
  const userWithPassword: MoverUserWithPassword = {
    ...user,
    password: STORED_PASSWORD_HASH,
  };
  const updatedUser: MoverUpdatedUser = {
    ...userWithPassword,
    authProvider: AuthProvider.LOCAL,
    providerUserId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  };
  const profile: MoverProfileRecord = {
    id: 1,
    userId,
    nickname: "mover-profile",
    imageUrl: null,
    career: 3,
    shortIntro: "test intro",
    description: "test description",
    confirmedCount: 0,
    averageRating: new Prisma.Decimal(0),
    reviewCount: 0,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    user: {
      name: user.name,
      email: user.email,
      phone: user.phone,
    },
    serviceAreas: [],
    serviceTypes: [],
  };

  return {
    role,
    userId,
    profileService: moverProfileService,
    profileRepository: moverProfileRepository,
    user,
    userWithPassword,
    updatedUser,
    profile,
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

  if (harness.role === "customer") {
    customerProfileRepository.findUserById = async () => harness.user;
    customerProfileRepository.findProfileByUserId = async () => harness.profile;
    customerProfileRepository.findUserWithPasswordById = async () => ({
      ...harness.userWithPassword,
      password,
    });
    customerProfileRepository.hasPasswordByUserId = async () => password !== null;
    customerProfileRepository.updateUser = async (_userId, data, _db) => {
      if (data.password !== undefined) {
        state.passwordUpdates.push(data.password);
      }

      return {
        ...harness.updatedUser,
        ...(data.name !== undefined && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.password !== undefined && { password: data.password }),
      };
    };
  } else {
    moverProfileRepository.findUserById = async () => harness.user;
    moverProfileRepository.findProfileByUserId = async () => harness.profile;
    moverProfileRepository.findUserWithPasswordById = async () => ({
      ...harness.userWithPassword,
      password,
    });
    moverProfileRepository.hasPasswordByUserId = async () => password !== null;
    moverProfileRepository.updateUser = async (_userId, data, _db) => {
      if (data.password !== undefined) {
        state.passwordUpdates.push(data.password);
      }

      return {
        ...harness.updatedUser,
        ...(data.name !== undefined && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.password !== undefined && { password: data.password }),
      };
    };
  }

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

function definePasswordValidationSuite(role: "customer"): void;
function definePasswordValidationSuite(role: "mover"): void;
function definePasswordValidationSuite(role: Role): void {
  describe(`${role} updateBasicInfo password validation (unit)`, () => {
    const harness = role === "customer" ? createHarness("customer") : createHarness("mover");

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

definePasswordValidationSuite("customer");
definePasswordValidationSuite("mover");
