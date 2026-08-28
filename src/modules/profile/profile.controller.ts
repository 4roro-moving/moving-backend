import { UserRole } from "@prisma/client";
import type { RequestHandler } from "express";

import { AppError } from "../../lib/app-error";

import { profileService as customerProfileService } from "./customer/profile.service";
import { profileService as moverProfileService } from "./mover/profile.service";
import { profileImageService } from "./profile-image.service";

/*
 * 프로필 이미지 업로드 URL을 발급한다.
 *
 * 인증된 사용자의 ID를 기준으로 이미지 Key를 생성하고
 * 프로필 이미지 업로드에 사용할 URL 정보를 반환한다.
 */
const createProfileImageUploadUrl: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  const data = await profileImageService.createUploadUrl(req.user.id, req.body);

  res.status(201).json({
    success: true,
    message: "프로필 이미지 업로드 URL을 발급했습니다.",
    data,
  });
};

/*
 * 내 프로필을 등록한다.
 *
 * 로그인한 사용자의 역할에 따라
 * 고객 또는 무버 프로필 Service를 호출한다.
 */
const createProfile: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  if (req.user.role === UserRole.CUSTOMER) {
    const data = await customerProfileService.createProfile(req.user.id, req.body);

    res.status(201).json({
      success: true,
      message: "고객 프로필을 등록했습니다.",
      data,
    });

    return;
  }

  if (req.user.role === UserRole.MOVER) {
    const data = await moverProfileService.createProfile(req.user.id, req.body);

    res.status(201).json({
      success: true,
      message: "기사님 프로필을 등록했습니다.",
      data,
    });

    return;
  }

  throw new AppError("FORBIDDEN", {
    message: "프로필을 등록할 수 없는 사용자 역할입니다.",
  });
};

/*
 * 내 프로필을 조회한다.
 *
 * 로그인한 사용자의 역할에 따라
 * 고객 또는 무버 프로필을 조회한다.
 */
const getMyProfile: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  if (req.user.role === UserRole.CUSTOMER) {
    const data = await customerProfileService.getMyProfile(req.user.id);

    res.status(200).json({
      success: true,
      message: "고객 프로필을 조회했습니다.",
      data,
    });

    return;
  }

  if (req.user.role === UserRole.MOVER) {
    const data = await moverProfileService.getMyProfile(req.user.id);

    res.status(200).json({
      success: true,
      message: "기사님 프로필을 조회했습니다.",
      data,
    });

    return;
  }

  throw new AppError("FORBIDDEN", {
    message: "프로필을 조회할 수 없는 사용자 역할입니다.",
  });
};

/*
 * 내 프로필 등록 여부를 조회한다.
 *
 * User의 프로필 완료 상태와
 * 실제 프로필 존재 여부를 Service에서 확인한다.
 */
const getProfileStatus: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  if (req.user.role === UserRole.CUSTOMER) {
    const data = await customerProfileService.getProfileStatus(req.user.id);

    res.status(200).json({
      success: true,
      message: "고객 프로필 등록 여부를 조회했습니다.",
      data,
    });

    return;
  }

  if (req.user.role === UserRole.MOVER) {
    const data = await moverProfileService.getProfileStatus(req.user.id);

    res.status(200).json({
      success: true,
      message: "기사님 프로필 등록 여부를 조회했습니다.",
      data,
    });

    return;
  }

  throw new AppError("FORBIDDEN", {
    message: "프로필 등록 여부를 조회할 수 없는 사용자 역할입니다.",
  });
};

/*
 * 내 기본정보를 수정한다.
 *
 * 로그인한 사용자의 역할에 따라
 * 고객 또는 무버의 이름, 전화번호, 비밀번호를 수정한다.
 */
const updateBasicInfo: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  if (req.user.role === UserRole.CUSTOMER) {
    const data = await customerProfileService.updateBasicInfo(req.user.id, req.body);

    res.status(200).json({
      success: true,
      message: "고객 기본정보를 수정했습니다.",
      data,
    });

    return;
  }

  if (req.user.role === UserRole.MOVER) {
    const data = await moverProfileService.updateBasicInfo(req.user.id, req.body);

    res.status(200).json({
      success: true,
      message: "기사님 기본정보를 수정했습니다.",
      data,
    });

    return;
  }

  throw new AppError("FORBIDDEN", {
    message: "기본정보를 수정할 수 없는 사용자 역할입니다.",
  });
};

/*
 * 내 프로필을 수정한다.
 *
 * 로그인한 사용자의 역할에 따라
 * 고객 또는 무버 프로필을 수정한다.
 */
const updateProfile: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new AppError("UNAUTHORIZED", {
      message: "인증이 필요합니다.",
    });
  }

  if (req.user.role === UserRole.CUSTOMER) {
    const data = await customerProfileService.updateProfile(req.user.id, req.body);

    res.status(200).json({
      success: true,
      message: "고객 프로필을 수정했습니다.",
      data,
    });

    return;
  }

  if (req.user.role === UserRole.MOVER) {
    const data = await moverProfileService.updateProfile(req.user.id, req.body);

    res.status(200).json({
      success: true,
      message: "기사님 프로필을 수정했습니다.",
      data,
    });

    return;
  }

  throw new AppError("FORBIDDEN", {
    message: "프로필을 수정할 수 없는 사용자 역할입니다.",
  });
};

export const profileController = {
  createProfileImageUploadUrl,
  createProfile,
  getMyProfile,
  getProfileStatus,
  updateBasicInfo,
  updateProfile,
};
