import { UserRole } from "@prisma/client";
import { Router } from "express";

import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";

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

export const profileRouter = Router();

/*
 * 고객 프로필을 등록한다.
 *
 * 고객 역할만 접근할 수 있으며,
 * 요청 Body를 검증한 뒤 프로필을 등록한다.
 */
profileRouter.post(
  "/customer",
  authenticate,
  authorize(UserRole.CUSTOMER),
  validate({
    body: createCustomerProfileSchema,
  }),
  asyncHandler(profileController.createProfile),
);

/*
 * 현재 로그인한 고객의 프로필을 조회한다.
 */
profileRouter.get(
  "/customer/me",
  authenticate,
  authorize(UserRole.CUSTOMER),
  asyncHandler(profileController.getMyProfile),
);

/*
 * 현재 로그인한 고객의
 * 프로필 등록 여부를 조회한다.
 */
profileRouter.get(
  "/customer/status",
  authenticate,
  authorize(UserRole.CUSTOMER),
  asyncHandler(profileController.getProfileStatus),
);

/*
 * 현재 로그인한 고객의 프로필을 수정한다.
 *
 * 요청 Body를 검증한 뒤
 * 고객 프로필 정보를 수정한다.
 */
profileRouter.patch(
  "/customer/me",
  authenticate,
  authorize(UserRole.CUSTOMER),
  validate({
    body: updateCustomerProfileSchema,
  }),
  asyncHandler(profileController.updateProfile),
);

/*
 * 무버 프로필을 등록한다.
 *
 * 무버 역할만 접근할 수 있으며,
 * 요청 Body를 검증한 뒤 프로필을 등록한다.
 */
profileRouter.post(
  "/mover",
  authenticate,
  authorize(UserRole.MOVER),
  validate({
    body: createMoverProfileSchema,
  }),
  asyncHandler(profileController.createProfile),
);

/*
 * 현재 로그인한 무버의 프로필을 조회한다.
 */
profileRouter.get(
  "/mover/me",
  authenticate,
  authorize(UserRole.MOVER),
  asyncHandler(profileController.getMyProfile),
);

/*
 * 현재 로그인한 무버의
 * 프로필 등록 여부를 조회한다.
 */
profileRouter.get(
  "/mover/status",
  authenticate,
  authorize(UserRole.MOVER),
  asyncHandler(profileController.getProfileStatus),
);

/*
 * 현재 로그인한 무버의 기본정보를 수정한다.
 *
 * User 테이블의 이름, 전화번호, 비밀번호를
 * 요청 Body 검증 후 수정한다.
 */
profileRouter.patch(
  "/mover/me/basic",
  authenticate,
  authorize(UserRole.MOVER),
  validate({
    body: updateMoverBasicInfoSchema,
  }),
  asyncHandler(profileController.updateBasicInfo),
);

/*
 * 현재 로그인한 무버의 프로필을 수정한다.
 *
 * MoverProfile 정보와 서비스 가능 지역,
 * 이사 유형을 요청 Body 검증 후 수정한다.
 */
profileRouter.patch(
  "/mover/me",
  authenticate,
  authorize(UserRole.MOVER),
  validate({
    body: updateMoverProfileSchema,
  }),
  asyncHandler(profileController.updateProfile),
);
