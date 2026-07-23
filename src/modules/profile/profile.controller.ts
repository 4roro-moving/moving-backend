import { UserRole } from "@prisma/client";
import type { RequestHandler } from "express";

import { AppError } from "../../lib/app-error";

import { profileService as customerProfileService } from "./customer/profile.service";
import { profileService as moverProfileService } from "./mover/profile.service";

/*
 * 로그인 사용자의 역할을 확인한다.
 *
 * 라우터에서 authenticate와 authorize를 먼저 실행하지만,
 * Controller에서도 req.user 존재 여부를 확인하여
 * 예상하지 못한 직접 호출이나 미들웨어 누락에 대비한다.
 */
const getAuthenticatedUser = (
  user: Express.Request["user"],
): NonNullable<Express.Request["user"]> => {
  if (!user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  return user;
};

/*
 * 내 프로필 등록
 *
 * 로그인 사용자의 역할에 따라
 * 고객 또는 무버 프로필 서비스를 호출한다.
 */
const createProfile: RequestHandler = async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req.user);

    if (user.role === UserRole.CUSTOMER) {
      const profile = await customerProfileService.createProfile(user.id, req.body);

      res.status(201).json(profile);

      return;
    }

    if (user.role === UserRole.MOVER) {
      const profile = await moverProfileService.createProfile(user.id, req.body);

      res.status(201).json(profile);

      return;
    }

    throw new AppError("FORBIDDEN", {
      message: "프로필을 등록할 수 없는 사용자 역할입니다.",
    });
  } catch (error) {
    next(error);
  }
};

/*
 * 내 프로필 조회
 *
 * 로그인 사용자의 역할에 따라
 * 고객 또는 무버 프로필을 조회한다.
 */
const getMyProfile: RequestHandler = async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req.user);

    if (user.role === UserRole.CUSTOMER) {
      const profile = await customerProfileService.getMyProfile(user.id);

      res.status(200).json(profile);

      return;
    }

    if (user.role === UserRole.MOVER) {
      const profile = await moverProfileService.getMyProfile(user.id);

      res.status(200).json(profile);

      return;
    }

    throw new AppError("FORBIDDEN", {
      message: "프로필을 조회할 수 없는 사용자 역할입니다.",
    });
  } catch (error) {
    next(error);
  }
};

/*
 * 내 프로필 등록 여부 조회
 *
 * User.isProfileCompleted 값과 실제 프로필 존재 여부를
 * 각 역할의 Service에서 확인한다.
 */
const getProfileStatus: RequestHandler = async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req.user);

    if (user.role === UserRole.CUSTOMER) {
      const status = await customerProfileService.getProfileStatus(user.id);

      res.status(200).json(status);

      return;
    }

    if (user.role === UserRole.MOVER) {
      const status = await moverProfileService.getProfileStatus(user.id);

      res.status(200).json(status);

      return;
    }

    throw new AppError("FORBIDDEN", {
      message: "프로필 등록 여부를 조회할 수 없는 사용자 역할입니다.",
    });
  } catch (error) {
    next(error);
  }
};

/*
 * 내 무버 기본정보 수정
 *
 * User 테이블:
 * - name
 * - phone
 * - password
 *
 * 무버 전용 API이므로 MOVER 역할만 허용한다.
 */
const updateBasicInfo: RequestHandler = async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req.user);

    if (user.role !== UserRole.MOVER) {
      throw new AppError("FORBIDDEN", {
        message: "기사님만 기본정보를 수정할 수 있습니다.",
      });
    }

    const profile = await moverProfileService.updateBasicInfo(user.id, req.body);

    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
};

/*
 * 내 프로필 수정
 *
 * 고객:
 * - 고객 프로필 정보 수정
 *
 * 무버:
 * - 닉네임
 * - 프로필 이미지
 * - 경력
 * - 한 줄 소개
 * - 상세 설명
 * - 서비스 가능 지역
 * - 이사 유형
 */
const updateProfile: RequestHandler = async (req, res, next) => {
  try {
    const user = getAuthenticatedUser(req.user);

    if (user.role === UserRole.CUSTOMER) {
      const profile = await customerProfileService.updateProfile(user.id, req.body);

      res.status(200).json(profile);

      return;
    }

    if (user.role === UserRole.MOVER) {
      const profile = await moverProfileService.updateProfile(user.id, req.body);

      res.status(200).json(profile);

      return;
    }

    throw new AppError("FORBIDDEN", {
      message: "프로필을 수정할 수 없는 사용자 역할입니다.",
    });
  } catch (error) {
    next(error);
  }
};

export const profileController = {
  createProfile,
  getMyProfile,
  getProfileStatus,
  updateBasicInfo,
  updateProfile,
};
