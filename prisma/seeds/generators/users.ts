/*
 * 계정 생성
 * ============================================================================
 *
 * User(UUID PK) 를 Node 에서 미리 만들어 두는 것이 핵심이다.
 * 이 덕분에 이후 모든 생성기가 DB 를 되조회하지 않고 FK 를 조립할 수 있고,
 * 프로필 이미지 S3 키(profiles/{userId}/...)도 적재 전에 확정된다.
 *
 * ── imageUrl 규약 ──────────────────────────────────────────────────────
 * DB 에는 S3 "키"만 저장한다. 완성 URL 을 넣으면 utils/image-url.ts 의
 * http(s) 바이패스 분기를 타서 CloudFront 경로가 전혀 검증되지 않는다.
 * (기존 시드가 picsum 완성 URL 을 넣어 정합성이 깨져 있던 지점)
 * ============================================================================
 */

import {
  AUTH_PROVIDER_WEIGHTS,
  PROFILE_IMAGE_POOL_SIZE,
  REGION_WEIGHTS,
  type SeedConfig,
} from "../config.js";
import { ANCHOR_CUSTOMER_COUNT, ANCHOR_MOVER_COUNT } from "../config.js";
import { adminEmail, customerEmail, isSuspended, moverEmail } from "../anchors/index.js";
import { paretoCount, pickSeasonalPastDate, weightedPick } from "../lib/distributions.js";
import { makeUuidV7 } from "../lib/ids.js";
import { chance, deriveRng, pick, randInt, sampleIndices, type Rng } from "../lib/rng.js";
import {
  makeAddress,
  makeDescription,
  makeDetailAddress,
  makeMoverNickname,
  makeName,
  makePhone,
  makeShortIntro,
} from "../lib/text.js";
import { REGIONS, type RegionRow } from "./regions.js";

export type MoveType = "SMALL" | "HOME" | "OFFICE";

export interface SeedUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: "CUSTOMER" | "MOVER" | "ADMIN";
  authProvider: "LOCAL" | "GOOGLE" | "NAVER" | "KAKAO";
  providerUserId: string | null;
  isActive: boolean;
  isProfileCompleted: boolean;
  createdAt: Date;

  /** 앵커 계정이면 1-based 번호, 벌크면 null */
  anchorIndex: number | null;

  /** 프로필 이미지 S3 키. 이미지 없는 계정은 null */
  imageKey: string | null;
}

export interface SeedMover extends SeedUser {
  profileId: number;
  nickname: string;
  career: number;
  regionIds: number[];
  moveTypes: MoveType[];
  homeRegionId: number;
}

export interface SeedCustomer extends SeedUser {
  profileId: number;
  regionIds: number[];
  moveTypes: MoveType[];
}

export interface UserBundle {
  admins: SeedUser[];
  customers: SeedCustomer[];
  movers: SeedMover[];

  rows: {
    users: unknown[];

    // User.role = ADMIN 계정의 관리자 내부 역할 정보.
    adminProfiles: unknown[];

    customerProfiles: unknown[];
    moverProfiles: unknown[];
    customerServiceAreas: unknown[];
    customerServiceTypes: unknown[];
    moverServiceAreas: unknown[];
    moverServiceTypes: unknown[];
    moverUnavailableDates: unknown[];
  };
}

const ALL_MOVE_TYPES: MoveType[] = ["SMALL", "HOME", "OFFICE"];

function profileImageKey(userId: string, poolIndex: number): string {
  const n = String((poolIndex % PROFILE_IMAGE_POOL_SIZE) + 1).padStart(3, "0");

  return `profiles/${userId}/seed-${n}.webp`;
}

/**
 * 소셜 계정 여부를 정한다.
 *
 * 기존 시드는 전 계정이 LOCAL 이라 @@unique([authProvider, providerUserId])
 * 경로가 한 번도 검증되지 않았다.
 */
function pickAuth(
  rng: Rng,
  userId: string,
): {
  authProvider: SeedUser["authProvider"];
  providerUserId: string | null;
  hasPassword: boolean;
} {
  const provider = weightedPick<"LOCAL" | "GOOGLE" | "NAVER" | "KAKAO">(rng, AUTH_PROVIDER_WEIGHTS);

  if (provider === "LOCAL") {
    return {
      authProvider: "LOCAL",
      providerUserId: null,
      hasPassword: true,
    };
  }

  return {
    authProvider: provider,
    providerUserId: `${provider.toLowerCase()}_${userId.replace(/-/g, "").slice(0, 20)}`,
    hasPassword: false,
  };
}

export function generateUsers(
  config: SeedConfig,
  regions: RegionRow[],
  passwordHash: string,
  now: Date,
): UserBundle {
  const rng = deriveRng(20260820, "users");
  const regionByName = new Map(regions.map((r) => [r.name, r.id]));

  const users: unknown[] = [];

  // ADMIN User와 1:1로 연결되는 관리자 프로필.
  const adminProfiles: unknown[] = [];

  const customerProfiles: unknown[] = [];
  const moverProfiles: unknown[] = [];
  const customerServiceAreas: unknown[] = [];
  const customerServiceTypes: unknown[] = [];
  const moverServiceAreas: unknown[] = [];
  const moverServiceTypes: unknown[] = [];
  const moverUnavailableDates: unknown[] = [];

  const admins: SeedUser[] = [];
  const customers: SeedCustomer[] = [];
  const movers: SeedMover[] = [];

  let phoneSeq = 1;
  let customerProfileId = 1;
  let moverProfileId = 1;
  let customerAreaId = 1;
  let customerTypeId = 1;
  let moverAreaId = 1;
  let moverTypeId = 1;
  let unavailableId = 1;

  /* ── 관리자 ────────────────────────────────────────────────────────── */

  /*
   * 관리자는 서비스 개시 이전부터 존재해야 한다.
   *
   * 관리자를 다른 계정과 같은 방식(과거 18개월 랜덤)으로 만들면
   * "공지를 쓴 관리자가 그 공지보다 나중에 가입", "약관 작성자가 약관보다 늦게 가입"
   * 같은 모순이 생긴다. 실제로도 운영자 계정이 먼저 있는 게 자연스럽다.
   *
   * 이 시드에서 생성하는 관리자들은 실제 서비스 운영을 담당하는 일반 ADMIN이다.
   * SUPER_ADMIN은 관리자 계정 관리 전용이므로 일반 관리자 시드와 분리한다.
   */
  const SERVICE_EPOCH = new Date(now.getTime() - 730 * 86_400_000);

  for (let i = 1; i <= config.admins; i += 1) {
    const createdAt = new Date(SERVICE_EPOCH.getTime() + i * 3_600_000);
    const id = makeUuidV7(rng, createdAt.getTime());

    const admin: SeedUser = {
      id,
      email: adminEmail(i),
      name: `관리자${i}`,
      phone: makePhone(phoneSeq),
      role: "ADMIN",
      authProvider: "LOCAL",
      providerUserId: null,
      isActive: true,
      isProfileCompleted: true,
      createdAt,
      anchorIndex: i,
      imageKey: null,
    };

    phoneSeq += 1;
    admins.push(admin);

    users.push({
      id: admin.id,
      email: admin.email,
      password: passwordHash,
      authProvider: "LOCAL",
      providerUserId: null,
      name: admin.name,
      phone: admin.phone,
      role: "ADMIN",
      isActive: true,
      isProfileCompleted: true,
      createdAt,
      updatedAt: createdAt,
    });

    /*
     * 일반 관리자용 AdminProfile.
     *
     * SUPER_ADMIN은 최초 1계정만 별도로 생성하며,
     * 일반 Seed 관리자에게는 ADMIN 역할만 부여한다.
     */
    adminProfiles.push({
      userId: admin.id,
      adminRole: "ADMIN",
      createdAt,
      updatedAt: createdAt,
    });
  }

  /* ── 고객 ──────────────────────────────────────────────────────────── */

  for (let i = 1; i <= config.customers; i += 1) {
    const isAnchor = i <= ANCHOR_CUSTOMER_COUNT;
    const createdAt = pickSeasonalPastDate(rng, now);
    const id = makeUuidV7(rng, createdAt.getTime());

    /*
     * 앵커 계정은 로그인 시나리오가 고정이어야 하므로 전부 LOCAL 로 둔다.
     * 벌크만 소셜을 섞는다.
     */
    const auth = isAnchor
      ? {
          authProvider: "LOCAL" as const,
          providerUserId: null,
          hasPassword: true,
        }
      : pickAuth(rng, id);

    // 앵커 9번 위치는 정지 계정
    const suspended = isAnchor && isSuspended(i);

    const imageKey = chance(rng, 0.85) ? profileImageKey(id, i) : null;

    const customer: SeedCustomer = {
      id,
      email: customerEmail(i),
      name: makeName(rng),
      phone: makePhone(phoneSeq),
      role: "CUSTOMER",
      authProvider: auth.authProvider,
      providerUserId: auth.providerUserId,
      isActive: !suspended,
      isProfileCompleted: true,
      createdAt,
      anchorIndex: isAnchor ? i : null,
      imageKey,
      profileId: customerProfileId,
      regionIds: [],
      moveTypes: [],
    };

    phoneSeq += 1;

    users.push({
      id,
      email: customer.email,
      password: auth.hasPassword ? passwordHash : null,
      authProvider: auth.authProvider,
      providerUserId: auth.providerUserId,
      name: customer.name,
      phone: customer.phone,
      role: "CUSTOMER",
      isActive: customer.isActive,
      isProfileCompleted: true,
      createdAt,
      updatedAt: createdAt,
    });

    customerProfiles.push({
      id: customerProfileId,
      userId: id,
      imageUrl: imageKey,
      createdAt,
      updatedAt: createdAt,
    });

    // 관심 지역 1~3개
    const areaCount = randInt(rng, 1, 3);
    const chosenRegions = new Set<number>();

    while (chosenRegions.size < areaCount) {
      const name = weightedPick<string>(rng, REGION_WEIGHTS);
      const regionId = regionByName.get(name);

      if (regionId !== undefined) {
        chosenRegions.add(regionId);
      }
    }

    for (const regionId of chosenRegions) {
      customerServiceAreas.push({
        id: customerAreaId,
        customerProfileId,
        regionId,
        createdAt,
      });

      customerAreaId += 1;
    }

    customer.regionIds = [...chosenRegions];

    // 관심 이사 유형 1~3개
    const typeCount = randInt(rng, 1, 3);
    const chosenTypes = new Set<MoveType>();

    while (chosenTypes.size < typeCount) {
      chosenTypes.add(pick(rng, ALL_MOVE_TYPES));
    }

    for (const moveType of chosenTypes) {
      customerServiceTypes.push({
        id: customerTypeId,
        customerProfileId,
        moveType,
        createdAt,
      });

      customerTypeId += 1;
    }

    customer.moveTypes = [...chosenTypes];

    customers.push(customer);
    customerProfileId += 1;
  }

  /* ── 기사 ──────────────────────────────────────────────────────────── */

  for (let i = 1; i <= config.movers; i += 1) {
    const isAnchor = i <= ANCHOR_MOVER_COUNT;
    const createdAt = pickSeasonalPastDate(rng, now);
    const id = makeUuidV7(rng, createdAt.getTime());

    const auth = isAnchor
      ? {
          authProvider: "LOCAL" as const,
          providerUserId: null,
          hasPassword: true,
        }
      : pickAuth(rng, id);

    const suspended = isAnchor && isSuspended(i);

    /*
     * 기사는 프로필 이미지가 곧 신뢰도라 거의 다 채운다.
     * 그래도 일부는 비워서 "이미지 없는 기사" 렌더링을 검증한다.
     */
    const imageKey = chance(rng, 0.95) ? profileImageKey(id, i + 500) : null;

    // 주 활동 지역 (수도권 편중)
    const homeRegionName = weightedPick<string>(rng, REGION_WEIGHTS);
    const homeRegionId = regionByName.get(homeRegionName) ?? 1;

    const career = paretoCount(rng, {
      min: 1,
      max: 30,
      alpha: 2.2,
    });

    const nickname = makeMoverNickname(i - 1, homeRegionName);

    /*
     * ── 활동 거점 ─────────────────────────────────────────────────
     *
     * 스키마상 nullable 이지만 그건 "기존 프로필 호환"을 위한 것이고,
     * 신규 기사는 값이 있는 게 정상이다. 전부 null 로 두면 지도 마커가
     * 통째로 빈 화면이 되어 기능 검증이 안 된다.
     *
     * 다만 12% 는 비워둔다 — 마이그레이션 이전에 가입한 기사를 재현해서
     * null 분기 렌더링도 함께 검증하기 위함이다.
     */
    const hasActivityBase = chance(rng, 0.88);

    const baseRegion = REGIONS.find((r) => r.name === homeRegionName) ?? REGIONS[0]!;

    const baseAddress = hasActivityBase ? makeAddress(rng, homeRegionName) : null;

    /*
     * 좌표는 시·도 중심에서 약간 흩뿌린다.
     * 전 기사가 정확히 같은 점에 찍히면 지도에서 마커가 하나로 겹쳐
     * 클러스터링·근접 검색을 테스트할 수 없다.
     *
     * 폭을 넓게 잡으면 "주소는 부산인데 좌표는 경남" 같은 어긋남이 생기므로
     * 시·도 경계를 크게 벗어나지 않을 정도(약 ±15km)로만 준다.
     */
    const jitter = (span: number): number => (rng() - 0.5) * span;

    const mover: SeedMover = {
      id,
      email: moverEmail(i),
      name: makeName(rng),
      phone: makePhone(phoneSeq),
      role: "MOVER",
      authProvider: auth.authProvider,
      providerUserId: auth.providerUserId,
      isActive: !suspended,
      isProfileCompleted: true,
      createdAt,
      anchorIndex: isAnchor ? i : null,
      imageKey,
      profileId: moverProfileId,
      nickname,
      career,
      regionIds: [],
      moveTypes: [],
      homeRegionId,
    };

    phoneSeq += 1;

    users.push({
      id,
      email: mover.email,
      password: auth.hasPassword ? passwordHash : null,
      authProvider: auth.authProvider,
      providerUserId: auth.providerUserId,
      name: mover.name,
      phone: mover.phone,
      role: "MOVER",
      isActive: mover.isActive,
      isProfileCompleted: true,
      createdAt,
      updatedAt: createdAt,
    });

    /*
     * averageRating / reviewCount / confirmedCount 는 여기서 0 으로 두고,
     * 리뷰·견적 적재가 끝난 뒤 SQL 한 번으로 실제 집계와 맞춘다.
     * (generators/stats.ts 참고)
     */
    moverProfiles.push({
      id: moverProfileId,
      userId: id,
      nickname,
      imageUrl: imageKey,
      career,
      shortIntro: makeShortIntro(rng),
      description: makeDescription(rng, career),
      activityBaseAddress: baseAddress?.address ?? null,
      activityBaseDetailAddress: hasActivityBase ? makeDetailAddress(rng) : null,
      activityBaseZipCode: baseAddress?.zipCode ?? null,

      // Decimal(9,6) / Decimal(10,6) — 소수 6자리로 맞춘다
      activityBaseLatitude: hasActivityBase
        ? Number((baseRegion.latitude + jitter(0.14)).toFixed(6))
        : null,

      activityBaseLongitude: hasActivityBase
        ? Number((baseRegion.longitude + jitter(0.16)).toFixed(6))
        : null,

      confirmedCount: 0,
      averageRating: 0,
      reviewCount: 0,
      createdAt,
      updatedAt: createdAt,
    });

    // 서비스 지역: 주 지역 + 인접 1~4개
    const areaCount = randInt(rng, 1, 5);
    const chosenRegions = new Set<number>([homeRegionId]);

    while (chosenRegions.size < areaCount) {
      const name = weightedPick<string>(rng, REGION_WEIGHTS);
      const regionId = regionByName.get(name);

      if (regionId !== undefined) {
        chosenRegions.add(regionId);
      }
    }

    for (const regionId of chosenRegions) {
      moverServiceAreas.push({
        id: moverAreaId,
        moverProfileId,
        regionId,
        createdAt,
      });

      moverAreaId += 1;
    }

    mover.regionIds = [...chosenRegions];

    // 제공 이사 유형 1~3개
    const typeCount = randInt(rng, 1, 3);
    const chosenTypes = new Set<MoveType>();

    while (chosenTypes.size < typeCount) {
      chosenTypes.add(pick(rng, ALL_MOVE_TYPES));
    }

    for (const moveType of chosenTypes) {
      moverServiceTypes.push({
        id: moverTypeId,
        moverProfileId,
        moveType,
        createdAt,
      });

      moverTypeId += 1;
    }

    mover.moveTypes = [...chosenTypes];

    /*
     * 휴무일: 미래 날짜만. 과거 휴무일은 의미가 없고,
     * mover-calendar 조회가 미래 기준으로 동작한다.
     */
    const dayOffCount = paretoCount(rng, {
      min: 1,
      max: 12,
      alpha: 1.8,
      zeroRatio: 0.35,
    });

    const dayOffs = sampleIndices(rng, 120, dayOffCount);

    for (const offset of dayOffs) {
      const date = new Date(now.getTime() + (offset + 1) * 86_400_000);

      moverUnavailableDates.push({
        id: unavailableId,
        moverId: id,
        date: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
        createdAt: now,
        updatedAt: now,
      });

      unavailableId += 1;
    }

    movers.push(mover);
    moverProfileId += 1;
  }

  return {
    admins,
    customers,
    movers,

    rows: {
      users,
      adminProfiles,
      customerProfiles,
      moverProfiles,
      customerServiceAreas,
      customerServiceTypes,
      moverServiceAreas,
      moverServiceTypes,
      moverUnavailableDates,
    },
  };
}
