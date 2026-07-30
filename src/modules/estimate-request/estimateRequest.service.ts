import type { EstimateRequestStatus, MoveType, NotificationType, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/app-error";
import { buildPagination } from "../../utils/pagination.util";

import { estimateRequestRepository } from "./estimateRequest.repository";
import type { EstimateRequestDetail } from "./estimateRequest.repository";
import type {
  AddressInput,
  CreateEstimateRequestInput,
  ListEstimateRequestQuery,
  UpdateEstimateRequestInput,
} from "./estimateRequest.type";

type Tx = Prisma.TransactionClient;

// 지정 견적을 요청할 수 있는 최대 기사님 수
const MAX_DESIGNATED_MOVERS = 3;

// 생성 시점부터의 기본 만료 기간(일)
const DEFAULT_EXPIRATION_DAYS = 7;

// 이사일이 임박한 경우 보장되는 최소 만료 기간(시간)
const MIN_EXPIRATION_HOURS = 24;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// 수정/취소가 가능한 상태
const EDITABLE_STATUSES: EstimateRequestStatus[] = ["PENDING", "OPEN"];

// 이미 종료되어 취소할 수 없는 상태
const CLOSED_STATUSES: EstimateRequestStatus[] = ["CANCELED", "COMPLETED", "EXPIRED"];

const MOVE_TYPE_LABEL: Record<MoveType, string> = {
  SMALL: "소형이사",
  HOME: "가정이사",
  OFFICE: "사무실이사",
};

/**
 * 시/도 이름 정규화 표.
 *
 * 카카오(다음) 우편번호 서비스는 축약형("서울")을 반환하지만
 * 정식 명칭이 들어올 수 있어 regions.name 과 매칭되도록 정규화
 */
const SIDO_ALIAS: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  세종시: "세종",
  경기도: "경기",
  강원도: "강원",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전라북도: "전북",
  전북특별자치도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
  제주도: "제주",
  제주특별자치도: "제주",
};

function resolveMoveDate(moveDate: string): Date {
  const parsed = new Date(`${moveDate}T00:00:00.000Z`);

  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * MS_PER_HOUR);
  const todayInKst = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()),
  );

  if (parsed.getTime() < todayInKst.getTime()) {
    throw new AppError("INVALID_MOVE_DATE");
  }

  return parsed;
}

function resolveExpiresAt(moveDate: Date): Date {
  const now = Date.now();

  const dayBeforeMove = moveDate.getTime() - MS_PER_DAY;
  const defaultExpiration = now + DEFAULT_EXPIRATION_DAYS * MS_PER_DAY;
  const minimumExpiration = now + MIN_EXPIRATION_HOURS * MS_PER_HOUR;

  const candidate = Math.min(dayBeforeMove, defaultExpiration);

  return new Date(Math.max(candidate, minimumExpiration));
}

// 주소의 시/도를 regions 레코드로 변환
async function resolveRegionId(address: AddressInput, db: Tx): Promise<number> {
  const trimmed = address.sido.trim();
  const name = SIDO_ALIAS[trimmed] ?? trimmed;

  const region = await estimateRequestRepository.findRegionByName(name, db);

  if (!region) {
    throw new AppError("REGION_NOT_FOUND", {
      data: { sido: address.sido },
    });
  }

  return region.id;
}

/* -------------------------------------------------------------------------- */
/* 공통 헬퍼                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * [A] 견적 요청을 조회하고, 존재 여부와 소유권을 함께 검증한다.
 * update / cancel / designate 등에서 반복되던 조회+검증을 한 곳으로 모은다.
 */
async function findOwnedRequestOrThrow(
  estimateRequestId: number,
  customerId: string,
  db: Tx,
): Promise<EstimateRequestDetail> {
  const request = await estimateRequestRepository.findById(estimateRequestId, db);

  if (!request) {
    throw new AppError("ESTIMATE_REQUEST_NOT_FOUND");
  }

  if (request.customerId !== customerId) {
    throw new AppError("FORBIDDEN", {
      message: "본인의 견적 요청만 접근할 수 있습니다.",
    });
  }

  return request;
}

/**
 * [D] 수정/지정이 가능한 상태인지 검증한다.
 * PENDING 또는 OPEN 이 아니면 에러를 던진다.
 */
function assertEditable(request: EstimateRequestDetail, message?: string): void {
  if (!EDITABLE_STATUSES.includes(request.status)) {
    throw new AppError("REQUEST_NOT_EDITABLE", message ? { message } : {});
  }
}

/**
 * [B] 히스토리에 남길 견적 요청 스냅샷을 만든다.
 * create / update 에서 반복되던 데이터 구성을 통일한다.
 */
function toHistorySnapshot(request: {
  moveType: MoveType;
  moveDate: Date;
  fromAddress: string;
  toAddress: string;
}): Prisma.InputJsonObject {
  return {
    moveType: request.moveType,
    moveDate: request.moveDate.toISOString(),
    fromAddress: request.fromAddress,
    toAddress: request.toAddress,
  };
}

/**
 * [C] 기사님에게 보낼 알림 payload 를 만든다.
 */
function buildMoverNotification(params: {
  moverId: string;
  type: NotificationType;
  title: string;
  content: string;
  estimateRequestId: number;
}): Prisma.NotificationCreateManyInput {
  return {
    userId: params.moverId,
    type: params.type,
    title: params.title,
    content: params.content,
    linkUrl: `/mover/estimate-requests/${String(params.estimateRequestId)}`,
  };
}

/* -------------------------------------------------------------------------- */
/* 서비스                                                                       */
/* -------------------------------------------------------------------------- */

type CreateParams = {
  customerId: string;
  input: CreateEstimateRequestInput;
};

type UpdateParams = {
  estimateRequestId: number;
  customerId: string;
  input: UpdateEstimateRequestInput;
};

type DesignateParams = {
  estimateRequestId: number;
  customerId: string;
  moverId: string;
};

export const estimateRequestService = {
  /**
   * 견적 요청을 생성하고 매칭된 기사님들에게 알림을 보낸다. 진행 중인 견적 요청이 이미 존재하면 에러를 던진다.
   */
  async createEstimateRequest({ customerId, input }: CreateParams): Promise<EstimateRequestDetail> {
    const moveDate = resolveMoveDate(input.moveDate);
    const expiresAt = resolveExpiresAt(moveDate);

    return prisma.$transaction(async (tx) => {
      const existing = await estimateRequestRepository.findActiveByCustomerId(customerId, tx);

      if (existing) {
        throw new AppError("ACTIVE_REQUEST_EXISTS", {
          data: { activeRequestId: existing.id },
        });
      }

      const [fromRegionId, toRegionId] = await Promise.all([
        resolveRegionId(input.from, tx),
        resolveRegionId(input.to, tx),
      ]);

      const created = await estimateRequestRepository.create(
        {
          customerId,
          moveType: input.moveType,
          moveDate,
          fromZipCode: input.from.zipCode ?? "",
          fromAddress: input.from.address,
          ...(input.from.detailAddress !== undefined && {
            fromDetailAddress: input.from.detailAddress,
          }),
          fromRegionId,
          toZipCode: input.to.zipCode ?? "",
          toAddress: input.to.address,
          ...(input.to.detailAddress !== undefined && {
            toDetailAddress: input.to.detailAddress,
          }),
          toRegionId,
          status: "OPEN",
          isActive: true,
          expiresAt,
        },
        tx,
      );

      await estimateRequestRepository.createHistory(
        {
          estimateRequestId: created.id,
          changedBy: customerId,
          type: "CREATED",
          changedData: toHistorySnapshot(created),
        },
        tx,
      );

      const moverIds = await estimateRequestRepository.findMatchingMoverIds(
        { fromRegionId, toRegionId, moveType: input.moveType },
        tx,
      );

      if (moverIds.length > 0) {
        await estimateRequestRepository.createNotifications(
          moverIds.map((moverId) =>
            buildMoverNotification({
              moverId,
              type: "ESTIMATE_REQUEST_RECEIVED",
              title: "새로운 견적 요청이 도착했어요",
              content: `${MOVE_TYPE_LABEL[created.moveType]} 견적 요청이 등록되었습니다.`,
              estimateRequestId: created.id,
            }),
          ),
          tx,
        );
      }

      return created;
    });
  },

  /**
   * 진행 중인 견적 요청을 조회하고 없으면 null 을 반환
   */
  getActiveEstimateRequest(customerId: string): Promise<EstimateRequestDetail | null> {
    return estimateRequestRepository.findActiveByCustomerId(customerId);
  },

  async getEstimateRequestById(
    estimateRequestId: number,
    customerId: string,
  ): Promise<EstimateRequestDetail> {
    return findOwnedRequestOrThrow(estimateRequestId, customerId, prisma);
  },

  async getMyEstimateRequestList(customerId: string, query: ListEstimateRequestQuery) {
    const { page, limit, status } = query;

    const { items, totalCount } = await estimateRequestRepository.findManyByCustomerId({
      customerId,
      skip: (page - 1) * limit,
      take: limit,
      ...(status !== undefined ? { status } : {}),
    });

    return {
      estimateRequests: items,
      pagination: buildPagination(totalCount, page, limit),
    };
  },

  /**
   * 견적이 도착하기 전까지만 수정가능
   */
  async updateEstimateRequest({
    estimateRequestId,
    customerId,
    input,
  }: UpdateParams): Promise<EstimateRequestDetail> {
    return prisma.$transaction(async (tx) => {
      const request = await findOwnedRequestOrThrow(estimateRequestId, customerId, tx);

      assertEditable(request);

      if (request._count.estimates > 0) {
        throw new AppError("REQUEST_NOT_EDITABLE");
      }

      const data: Prisma.EstimateRequestUncheckedUpdateInput = {};

      if (input.moveType !== undefined) {
        data.moveType = input.moveType;
      }

      if (input.moveDate !== undefined) {
        const moveDate = resolveMoveDate(input.moveDate);

        data.moveDate = moveDate;
        data.expiresAt = resolveExpiresAt(moveDate);
      }

      if (input.from !== undefined) {
        data.fromZipCode = input.from.zipCode ?? "";
        data.fromAddress = input.from.address;
        data.fromDetailAddress = input.from.detailAddress ?? null;
        data.fromRegionId = await resolveRegionId(input.from, tx);
      }

      if (input.to !== undefined) {
        data.toZipCode = input.to.zipCode ?? "";
        data.toAddress = input.to.address;
        data.toDetailAddress = input.to.detailAddress ?? null;
        data.toRegionId = await resolveRegionId(input.to, tx);
      }

      const updated = await estimateRequestRepository.update(estimateRequestId, data, tx);

      await estimateRequestRepository.createHistory(
        {
          estimateRequestId,
          changedBy: customerId,
          type: "UPDATED",
          previousData: toHistorySnapshot(request),
          changedData: toHistorySnapshot(updated),
        },
        tx,
      );

      return updated;
    });
  },

  async cancelEstimateRequest(
    estimateRequestId: number,
    customerId: string,
  ): Promise<EstimateRequestDetail> {
    return prisma.$transaction(async (tx) => {
      const request = await findOwnedRequestOrThrow(estimateRequestId, customerId, tx);

      if (CLOSED_STATUSES.includes(request.status)) {
        throw new AppError("REQUEST_NOT_EDITABLE", {
          message: "이미 종료된 견적 요청입니다.",
        });
      }

      const canceled = await estimateRequestRepository.update(
        estimateRequestId,
        {
          status: "CANCELED",
          isActive: false,
          canceledAt: new Date(),
        },
        tx,
      );

      await estimateRequestRepository.createHistory(
        {
          estimateRequestId,
          changedBy: customerId,
          type: "CANCELED",
          previousData: { status: request.status },
          changedData: { status: canceled.status },
        },
        tx,
      );

      return canceled;
    });
  },

  /**
   * 특정 기사님을 지정해 견적을 요청
   */
  async designateMover({
    estimateRequestId,
    customerId,
    moverId,
  }: DesignateParams): Promise<EstimateRequestDetail> {
    return prisma.$transaction(async (tx) => {
      const request = await findOwnedRequestOrThrow(estimateRequestId, customerId, tx);

      assertEditable(request, "지금은 지정 견적을 요청할 수 없는 상태입니다.");

      if (request.expiresAt.getTime() <= Date.now()) {
        throw new AppError("REQUEST_NOT_EDITABLE", {
          message: "만료된 견적 요청입니다.",
        });
      }

      const mover = await estimateRequestRepository.findMoverForDesignation(moverId, tx);

      if (!mover) {
        throw new AppError("MOVER_NOT_FOUND");
      }

      const existing = await estimateRequestRepository.findDesignation(
        estimateRequestId,
        moverId,
        tx,
      );

      if (existing) {
        throw new AppError("ALREADY_DESIGNATED");
      }

      const designationCount = await estimateRequestRepository.countDesignations(
        estimateRequestId,
        tx,
      );

      if (designationCount >= MAX_DESIGNATED_MOVERS) {
        throw new AppError("DESIGNATION_LIMIT_EXCEEDED");
      }

      await estimateRequestRepository.createDesignation(estimateRequestId, moverId, tx);

      await estimateRequestRepository.createNotifications(
        [
          buildMoverNotification({
            moverId,
            type: "DESIGNATED_REQUEST_RECEIVED",
            title: "지정 견적 요청이 도착했어요",
            content: "고객님이 회원님을 지정하여 견적을 요청했습니다.",
            estimateRequestId,
          }),
        ],
        tx,
      );

      return findOwnedRequestOrThrow(estimateRequestId, customerId, tx);
    });
  },
};
