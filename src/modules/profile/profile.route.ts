import { UserRole } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";

import {
  createProfileSchema as createCustomerProfileSchema,
  updateProfileSchema as updateCustomerProfileSchema,
} from "./customer/profile.validator";

import {
  createProfileSchema as createMoverProfileSchema,
  updateBasicInfoSchema as updateMoverBasicInfoSchema,
  updateProfileSchema as updateMoverProfileSchema,
} from "./mover/profile.validator";

import { profileController } from "./profile.controller";

const profileRouter = Router();

/*
 * 고객 프로필 등록
 * POST /profiles/customer
 */
profileRouter.post(
  "/customer",
  authenticate,
  authorize(UserRole.CUSTOMER),
  validate({
    body: createCustomerProfileSchema,
  }),
  profileController.createProfile,
);

/*
 * 내 고객 프로필 조회
 * GET /profiles/customer/me
 */
profileRouter.get(
  "/customer/me",
  authenticate,
  authorize(UserRole.CUSTOMER),
  profileController.getMyProfile,
);

/*
 * 고객 프로필 등록 여부 조회
 * GET /profiles/customer/status
 */
profileRouter.get(
  "/customer/status",
  authenticate,
  authorize(UserRole.CUSTOMER),
  profileController.getProfileStatus,
);

/*
 * 내 고객 프로필 수정
 * PATCH /profiles/customer/me
 */
profileRouter.patch(
  "/customer/me",
  authenticate,
  authorize(UserRole.CUSTOMER),
  validate({
    body: updateCustomerProfileSchema,
  }),
  profileController.updateProfile,
);

/*
 * 무버 프로필 등록
 * POST /profiles/mover
 */
profileRouter.post(
  "/mover",
  authenticate,
  authorize(UserRole.MOVER),
  validate({
    body: createMoverProfileSchema,
  }),
  profileController.createProfile,
);

/*
 * 내 무버 프로필 조회
 * GET /profiles/mover/me
 */
profileRouter.get(
  "/mover/me",
  authenticate,
  authorize(UserRole.MOVER),
  profileController.getMyProfile,
);

/*
 * 무버 프로필 등록 여부 조회
 * GET /profiles/mover/status
 */
profileRouter.get(
  "/mover/status",
  authenticate,
  authorize(UserRole.MOVER),
  profileController.getProfileStatus,
);

/*
 * 내 무버 기본정보 수정
 *
 * User 테이블:
 * - name
 * - phone
 * - password
 *
 * PATCH /profiles/mover/me/basic
 */
profileRouter.patch(
  "/mover/me/basic",
  authenticate,
  authorize(UserRole.MOVER),
  validate({
    body: updateMoverBasicInfoSchema,
  }),
  profileController.updateBasicInfo,
);

/*
 * 내 무버 프로필 수정
 *
 * MoverProfile 테이블:
 * - nickname
 * - imageUrl
 * - career
 * - shortIntro
 * - description
 *
 * 관계 테이블:
 * - serviceAreas
 * - serviceTypes
 *
 * PATCH /profiles/mover/me
 */
profileRouter.patch(
  "/mover/me",
  authenticate,
  authorize(UserRole.MOVER),
  validate({
    body: updateMoverProfileSchema,
  }),
  profileController.updateProfile,
);

export { profileRouter };
