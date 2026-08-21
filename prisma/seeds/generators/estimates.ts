/*
 * 견적 흐름 전체 생성 (핵심 생성기)
 * ============================================================================
 *
 *  EstimateRequest 를 중심으로 아래를 한 번에 만든다.
 *    · EstimateRequest          (상태별 분포)
 *    · EstimateRequestHistory   (상태 전이와 1:1 대응)
 *    · DesignatedMover          (지정 요청)
 *    · Estimate                 (요청당 0~6건)
 *    · EstimateRequestRejection (기사 반려)
 *    · Review                   (COMPLETED 의 80%)
 *    · ChatRoom / ChatMessage   (확정 견적당 1방)
 *
 *  ── 반드시 지켜야 하는 불변식 ─────────────────────────────────────────
 *   1) request.createdAt < estimate.createdAt < confirmedAt <= moveDate
 *   2) review.createdAt > moveDate  (이사 전에 리뷰를 쓸 수 없다)
 *   3) 리뷰는 estimate.status=CONFIRMED AND request.status=COMPLETED 에만
 *   4) review.customerId == request.customerId, review.moverId == estimate.moverId
 *   5) request.confirmedEstimateId 는 실제 확정 견적을 가리킨다 (unique)
 *   6) EXPIRED 는 confirmedEstimateId 가 null 이어야 한다
 *   7) 고객당 활성(isActive) 요청은 최대 1건 (OPEN / PENDING)
 *   8) expiresAt = moveDate - 1일
 *   9) Estimate @@unique([estimateRequestId, moverId])
 *  10) ChatRoom.lastMessageAt 은 실제 마지막 메시지 시각과 일치
 * ============================================================================
 */

import {
  DESIGNATED_REQUEST_RATE,
  ESTIMATES_PER_REQUEST_WEIGHTS,
  MOVE_TYPE_WEIGHTS,
  PRICE_RANGE,
  REGION_WEIGHTS,
  REJECTION_RATE,
  type SeedConfig,
} from "../config.js";
import {
  addDays,
  addMinutes,
  allocatePareto,
  pickFutureDate,
  pickRating,
  toDateOnly,
  weightedPick,
} from "../lib/distributions.js";
import { chance, deriveRng, randInt, sampleIndices, shuffled, type Rng } from "../lib/rng.js";
import {
  makeAddress,
  makeChatMessage,
  makeDetailAddress,
  makeQuoteComment,
  makeRejectionReason,
  makeReviewContent,
} from "../lib/text.js";
import type { RegionRow } from "./regions.js";
import type { MoveType, SeedCustomer, SeedMover } from "./users.js";

type RequestStatus = "PENDING" | "OPEN" | "CONFIRMED" | "COMPLETED" | "EXPIRED" | "CANCELED";

export interface EstimateFlowResult {
  rows: {
    estimateRequests: unknown[];
    estimateRequestHistories: unknown[];
    designatedMovers: unknown[];
    estimates: unknown[];
    estimateRequestRejections: unknown[];
    reviews: unknown[];
    chatRooms: unknown[];
    chatMessages: unknown[];
  };
  /** 확정 견적 id 를 요청에 반영하기 위한 UPDATE 목록 */
  confirmedLinks: { requestId: number; estimateId: number }[];
  /** 알림 생성에 쓰이는 이벤트 요약 */
  events: {
    reviewsByMover: Map<string, number>;
    confirmedByMover: Map<string, number>;
  };
  /** 사용자별 마지막 활동 시각 — 정지 시각은 이보다 뒤여야 한다 */
  lastActivityByUser: Map<string, Date>;
  stats: {
    requests: number;
    estimates: number;
    reviews: number;
    chatRooms: number;
    chatMessages: number;
  };
}

/** 상태별 요청 수를 하나의 목록으로 펼친다. */
function buildStatusPlan(config: SeedConfig, rng: Rng): RequestStatus[] {
  const r = config.requests;

  const plan: RequestStatus[] = [
    ...Array<RequestStatus>(r.completed).fill("COMPLETED"),
    ...Array<RequestStatus>(r.open).fill("OPEN"),
    ...Array<RequestStatus>(r.expired).fill("EXPIRED"),
    ...Array<RequestStatus>(r.confirmed).fill("CONFIRMED"),
    ...Array<RequestStatus>(r.canceled).fill("CANCELED"),
    ...Array<RequestStatus>(r.pending).fill("PENDING"),
  ];

  return shuffled(rng, plan);
}

function priceFor(rng: Rng, moveType: MoveType): number {
  const [min, max] = PRICE_RANGE[moveType];

  // 만원 단위로 떨어지게
  return Math.round(randInt(rng, min, max) / 10_000) * 10_000;
}

export function generateEstimateFlow(
  config: SeedConfig,
  regions: RegionRow[],
  customers: SeedCustomer[],
  movers: SeedMover[],
  unavailableDates: { moverId: string; date: Date }[],
  now: Date,
): EstimateFlowResult {
  const rng = deriveRng(20260820, "estimates");
  const regionByName = new Map(regions.map((r) => [r.name, r.id]));
  const regionNameById = new Map(regions.map((r) => [r.id, r.name]));

  /*
   * 지역별 기사 인덱스.
   *
   * 요청마다 "이 시점에 이미 가입한 활성 기사"를 골라야 하는데, 매번 풀 전체를
   * filter 하면 O(요청수 × 풀크기) 가 되어 규모가 커질수록 급격히 느려진다.
   * (기사 5,000 → 30,000 으로 늘렸을 때 생성 시간이 데이터 3.4배 대비 20배 증가)
   *
   * 그래서 활성 기사만 남기고 가입일 오름차순으로 한 번만 정렬해 둔다.
   * 이후에는 이진 탐색으로 "가입일 <= 요청일" 구간의 끝을 찾아
   * 그 앞부분에서만 표본을 뽑으면 된다. O(log 풀크기) 로 떨어진다.
   */
  const moversByRegion = new Map<number, SeedMover[]>();

  for (const mover of movers) {
    if (!mover.isActive) {
      continue;
    }

    for (const regionId of mover.regionIds) {
      const list = moversByRegion.get(regionId) ?? [];
      list.push(mover);
      moversByRegion.set(regionId, list);
    }
  }

  for (const list of moversByRegion.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /** 정렬된 풀에서 createdAt <= cutoff 인 원소 개수를 이진 탐색으로 구한다 */
  const eligibleCount = (pool: SeedMover[], cutoff: number): number => {
    let lo = 0;
    let hi = pool.length;

    while (lo < hi) {
      const mid = (lo + hi) >>> 1;

      if (pool[mid]!.createdAt.getTime() <= cutoff) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    return lo;
  };

  const activeMovers = movers
    .filter((m) => m.isActive)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const estimateRequests: unknown[] = [];
  const estimateRequestHistories: unknown[] = [];
  const designatedMovers: unknown[] = [];
  const estimates: unknown[] = [];
  const estimateRequestRejections: unknown[] = [];
  const reviews: unknown[] = [];
  const chatRooms: unknown[] = [];
  const chatMessages: unknown[] = [];
  const confirmedLinks: { requestId: number; estimateId: number }[] = [];

  const reviewsByMover = new Map<string, number>();
  const confirmedByMover = new Map<string, number>();
  const lastActivityByUser = new Map<string, Date>();

  const touch = (userId: string, at: Date): void => {
    const prev = lastActivityByUser.get(userId);

    if (!prev || at.getTime() > prev.getTime()) {
      lastActivityByUser.set(userId, at);
    }
  };

  /** 기사별 휴무일 (YYYY-MM-DD) */
  const unavailableByMover = new Map<string, Set<string>>();

  for (const row of unavailableDates) {
    const set = unavailableByMover.get(row.moverId) ?? new Set<string>();
    set.add(row.date.toISOString().slice(0, 10));
    unavailableByMover.set(row.moverId, set);
  }

  /** 이미 확정된 (기사|날짜) — 기사 이중 예약 방지 */
  const bookedMoverDays = new Set<string>();

  /** 이미 확정된 (고객|날짜) — 한 고객이 하루에 두 번 이사할 수는 없다 */
  const bookedCustomerDays = new Set<string>();

  let requestId = 1;
  let historyId = 1;
  let designatedId = 1;
  let estimateId = 1;
  let rejectionId = 1;
  let reviewId = 1;
  let chatRoomId = 1;
  let chatMessageId = 1;

  const statusPlan = buildStatusPlan(config, rng);

  /*
   * 요청을 고객에게 파레토로 배분한다.
   * 균등하게 나누면 "고객당 5건씩" 같은 비현실적인 데이터가 되고,
   * 이력 많은 계정 / 신규 계정 양쪽 UI 가 재현되지 않는다.
   *
   * 다만 두 가지를 제어해야 한다.
   *  · max        : 파레토 꼬리를 그대로 두면 한 고객이 이사를 1,000번 하게 된다.
   *  · weightScale: 가입 기간이 짧은 고객에게 과거 이력을 많이 주면
   *                 "가입 전에 이사한 요청"이 되어 전부 버려진다.
   *                 재직 기간에 비례해 배분해야 유실이 사라진다.
   */
  const nowMs = now.getTime();
  const oldestJoinMs = customers.reduce((min, c) => Math.min(min, c.createdAt.getTime()), nowMs);
  const tenureSpan = Math.max(1, nowMs - oldestJoinMs);

  const perCustomer = allocatePareto(rng, customers.length, statusPlan.length, {
    alpha: 1.9,
    zeroRatio: 0.1,
    max: 40,
    weightScale: (index) => {
      const tenure = nowMs - customers[index]!.createdAt.getTime();

      // 신규 가입자도 최소한의 기회는 갖되(0.08), 오래된 계정일수록 이력이 많다
      return 0.08 + 0.92 * (tenure / tenureSpan);
    },
  });

  let planCursor = 0;

  for (let ci = 0; ci < customers.length; ci += 1) {
    const customer = customers[ci]!;
    const count = perCustomer[ci]!;

    /*
     * "고객은 동시에 하나의 활성 요청만" 정책을 지키기 위해
     * 이 고객이 이미 활성 요청을 가졌는지 추적한다.
     */
    let hasActiveRequest = false;

    for (let k = 0; k < count && planCursor < statusPlan.length; k += 1) {
      let status = statusPlan[planCursor]!;
      planCursor += 1;

      // 활성 요청이 이미 있으면 활성 상태(OPEN/PENDING)를 완료로 바꾼다
      if ((status === "OPEN" || status === "PENDING") && hasActiveRequest) {
        status = "COMPLETED";
      }

      const isActive = status === "OPEN" || status === "PENDING";

      if (isActive) {
        hasActiveRequest = true;
      }

      const moveType = weightedPick<MoveType>(rng, MOVE_TYPE_WEIGHTS);

      /*
       * 출발지는 고객의 관심 지역에서, 도착지는 전체 분포에서 뽑는다.
       * 같은 지역 내 이사도 흔하므로 굳이 다르게 강제하지 않는다.
       */
      const fromRegionId =
        customer.regionIds.length > 0 && chance(rng, 0.7)
          ? customer.regionIds[randInt(rng, 0, customer.regionIds.length - 1)]!
          : (regionByName.get(weightedPick<string>(rng, REGION_WEIGHTS)) ?? 1);

      const toRegionId = regionByName.get(weightedPick<string>(rng, REGION_WEIGHTS)) ?? 1;

      const fromName = regionNameById.get(fromRegionId) ?? "서울";
      const toName = regionNameById.get(toRegionId) ?? "서울";

      const from = makeAddress(rng, fromName);
      const to = makeAddress(rng, toName);

      /*
       * ── 시간축 ─────────────────────────────────────────────────────
       * 과거형 상태는 moveDate 가 과거, 진행형은 미래여야 한다.
       *
       * 과거 이사일은 반드시 "고객 가입 이후"에서 뽑는다. 가입일과 무관하게
       * 뽑으면 가입 한 달 된 고객에게 1년 전 이사 이력이 배정되고,
       * 그걸 버리느라 요청의 절반이 유실된다.
       */
      const isPastStatus = status === "COMPLETED" || status === "EXPIRED" || status === "CANCELED";

      let moveDate: Date;

      if (isPastStatus) {
        // 가입 + 최소 8일 ~ 지금 사이. 창이 너무 좁으면 이 요청은 만들지 않는다.
        const windowStart = customer.createdAt.getTime() + 8 * 86_400_000;
        const windowEnd = now.getTime();

        if (windowStart >= windowEnd) {
          continue;
        }

        moveDate = new Date(windowStart + rng() * (windowEnd - windowStart));
        moveDate.setUTCHours(randInt(rng, 8, 18), 0, 0, 0);

        if (moveDate.getTime() > windowEnd) {
          moveDate = new Date(windowEnd);
        }
      } else {
        moveDate = pickFutureDate(rng, now, 3, 90);
      }

      const leadDays = randInt(rng, 7, 60);
      let createdAt = addDays(moveDate, -leadDays);

      // 고객 가입 이전에 요청이 생길 수는 없다
      if (createdAt.getTime() < customer.createdAt.getTime()) {
        createdAt = new Date(customer.createdAt.getTime() + randInt(rng, 1, 48) * 3_600_000);
      }

      /*
       * 진행 중(OPEN/CONFIRMED) 요청은 moveDate 가 미래라
       * moveDate - leadDays 가 아직 미래일 수 있다. 요청은 이미 존재하므로
       * createdAt 은 반드시 현재 이전이어야 한다.
       */
      if (createdAt.getTime() > now.getTime()) {
        const windowStart = customer.createdAt.getTime();
        createdAt = new Date(windowStart + rng() * (now.getTime() - windowStart));
      }

      /*
       * moveDate 는 @db.Date 라 자정으로 저장된다. 요청 생성이 그 자정보다
       * 늦으면 "이사 당일 이후에 요청함"이 되어 검증에 걸린다.
       */
      const moveDateOnly = toDateOnly(moveDate);

      if (createdAt.getTime() >= moveDateOnly.getTime()) {
        continue;
      }

      /*
       * ── 견적 제출 기사 선정 (요청을 push 하기 전에 결정한다) ────────
       *
       * 여기서 미리 정하지 않으면, 요청을 COMPLETED 로 넣어놓고
       * 뒤늦게 "견적 낼 기사가 없다"는 걸 알게 되어 confirmedEstimateId 가
       * 비어 있는 COMPLETED 요청이 남는다. 상태 정합성이 깨지는 지점이다.
       */
      const candidatePool = moversByRegion.get(fromRegionId) ?? activeMovers;

      const wantCount =
        status === "PENDING"
          ? 0
          : (weightedPick<number>(rng, ESTIMATES_PER_REQUEST_WEIGHTS) as number);

      /*
       * 요청 시점에 아직 가입하지 않은 기사는 견적을 낼 수 없다.
       * 풀이 가입일 오름차순이므로 이진 탐색으로 구한 개수 앞부분이 곧 후보다.
       * (배열을 새로 만들지 않으므로 GC 압력도 줄어든다)
       */
      const eligibleSize = wantCount === 0 ? 0 : eligibleCount(candidatePool, createdAt.getTime());

      const picked =
        eligibleSize === 0
          ? []
          : sampleIndices(rng, eligibleSize, Math.min(wantCount, eligibleSize)).map(
              (i) => candidatePool[i]!,
            );

      /*
       * 확정이 필요한 상태인데 견적을 낸 기사가 없으면 상태를 낮춘다.
       *
       * 단, EXPIRED 는 "이사일이 지났는데 확정 못 함"이라는 뜻이므로
       * 이사일이 미래인 CONFIRMED 를 그냥 EXPIRED 로 바꾸면
       * "만료됐는데 이사일은 아직 안 옴"이라는 모순이 생긴다.
       * 미래 건은 강등하지 말고 아예 만들지 않는다.
       */
      if ((status === "COMPLETED" || status === "CONFIRMED") && picked.length === 0) {
        if (!isPastStatus) {
          continue;
        }

        status = "EXPIRED";
      }

      const expiresAt = addDays(moveDate, -1);
      const currentRequestId = requestId;
      requestId += 1;

      /*
       * ── 확정 대상 선정 (요청을 push 하기 전에 끝낸다) ─────────────
       *
       * 아무나 확정하면 세 가지 현실 위반이 생긴다.
       *   1) 기사 휴무일에 이사가 확정됨
       *   2) 같은 기사가 같은 날 두 건을 동시에 수행함
       *   3) 같은 고객이 하루에 두 번 이사함
       *
       * 그리고 이 판단은 반드시 push 이전에 해야 한다. push 뒤에 상태를
       * 낮추면 이미 기록된 행은 COMPLETED 인데 확정 견적이 없는 상태로 남는다.
       */
      const needsConfirmed = status === "COMPLETED" || status === "CONFIRMED";
      const moveDayKey = moveDateOnly.toISOString().slice(0, 10);
      const customerDayKey = `${customer.id}|${moveDayKey}`;

      let confirmedIndex = -1;

      if (needsConfirmed) {
        if (!bookedCustomerDays.has(customerDayKey)) {
          for (const i of shuffled(
            rng,
            picked.map((_, idx) => idx),
          )) {
            const candidate = picked[i]!;
            const busyKey = `${candidate.id}|${moveDayKey}`;

            if (unavailableByMover.get(candidate.id)?.has(moveDayKey)) {
              continue;
            }

            if (bookedMoverDays.has(busyKey)) {
              continue;
            }

            confirmedIndex = i;
            bookedMoverDays.add(busyKey);
            bookedCustomerDays.add(customerDayKey);
            break;
          }
        }

        // 확정할 기사를 못 찾았으면 과거 건은 만료, 미래 건은 만들지 않는다
        if (confirmedIndex === -1) {
          if (!isPastStatus) {
            continue;
          }

          status = "EXPIRED";
        }
      }

      /* 상태 강등이 끝난 뒤에 파생 시각을 계산한다 */
      /*
       * 취소는 이사일 이전에만 가능하다. 이사일이 지난 뒤 취소하는 건
       * 상태 흐름상 존재하지 않는다(그건 COMPLETED 나 EXPIRED 다).
       */
      const canceledAt =
        status === "CANCELED"
          ? new Date(
              Math.min(
                now.getTime(),
                moveDateOnly.getTime() - 3_600_000,
                addDays(createdAt, randInt(rng, 1, Math.max(1, leadDays - 1))).getTime(),
              ),
            )
          : null;
      const expiredAt = status === "EXPIRED" ? expiresAt : null;
      const rawCompletedAt =
        status === "COMPLETED"
          ? new Date(moveDate.getTime() + randInt(rng, 4, 12) * 3_600_000)
          : null;

      // 이사가 오늘이었으면 완료 시각이 미래로 넘어갈 수 있다
      const completedAt =
        rawCompletedAt && rawCompletedAt.getTime() > now.getTime() ? now : rawCompletedAt;

      touch(customer.id, createdAt);

      estimateRequests.push({
        id: currentRequestId,
        customerId: customer.id,
        moveType,
        moveDate: toDateOnly(moveDate),
        fromZipCode: from.zipCode,
        fromAddress: from.address,
        fromDetailAddress: makeDetailAddress(rng),
        fromRegionId,
        toZipCode: to.zipCode,
        toAddress: to.address,
        toDetailAddress: makeDetailAddress(rng),
        toRegionId,
        status,
        isActive,
        expiresAt,
        expiredAt,
        confirmedEstimateId: null, // 아래 confirmedLinks 로 나중에 UPDATE
        createdAt,
        updatedAt: completedAt ?? canceledAt ?? createdAt,
        canceledAt,
        completedAt,
      });

      /* ── 요청 변경 이력 ───────────────────────────────────────────── */

      estimateRequestHistories.push({
        id: historyId,
        estimateRequestId: currentRequestId,
        changedBy: customer.id,
        type: "CREATED",
        previousData: null,
        changedData: { moveType, fromRegionId, toRegionId },
        createdAt,
      });
      historyId += 1;

      // PENDING(임시저장)이 아니면 제출 이력이 남는다
      if (status !== "PENDING") {
        const submittedAt = new Date(
          Math.min(now.getTime(), createdAt.getTime() + randInt(rng, 3, 180) * 60_000),
        );

        estimateRequestHistories.push({
          id: historyId,
          estimateRequestId: currentRequestId,
          changedBy: customer.id,
          type: "SUBMITTED",
          previousData: { status: "PENDING" },
          changedData: { status: "OPEN" },
          createdAt: submittedAt,
        });
        historyId += 1;
      }

      /*
       * 일부 요청은 중간에 내용을 수정한다.
       * 취소된 요청이라면 수정은 반드시 취소 이전에 일어나야 한다.
       * (id 순서와 시간 순서가 어긋나면 이력 타임라인이 뒤집혀 보인다)
       */
      if (status !== "PENDING" && chance(rng, 0.22)) {
        const updateUpperBound = Math.min(
          now.getTime(),
          canceledAt ? canceledAt.getTime() - 60_000 : Number.POSITIVE_INFINITY,
          createdAt.getTime() + randInt(rng, 200, 4_000) * 60_000,
        );

        if (updateUpperBound > createdAt.getTime()) {
          estimateRequestHistories.push({
            id: historyId,
            estimateRequestId: currentRequestId,
            changedBy: customer.id,
            type: "UPDATED",
            previousData: { moveDate: toDateOnly(addDays(moveDate, -3)) },
            changedData: { moveDate: toDateOnly(moveDate) },
            createdAt: new Date(updateUpperBound),
          });
          historyId += 1;
        }
      }

      if (canceledAt) {
        estimateRequestHistories.push({
          id: historyId,
          estimateRequestId: currentRequestId,
          changedBy: customer.id,
          type: "CANCELED",
          previousData: { status: "OPEN" },
          changedData: { status: "CANCELED" },
          createdAt: canceledAt,
        });
        historyId += 1;
      }

      // PENDING 은 기사에게 노출되지 않으므로 견적이 없다
      if (status === "PENDING") {
        continue;
      }

      if (picked.length === 0) {
        continue;
      }

      const isDesignatedRequest = chance(rng, DESIGNATED_REQUEST_RATE);
      // 지정은 최대 3명 (서비스 정책)
      const designatedSet = new Set<string>(
        isDesignatedRequest ? picked.slice(0, Math.min(3, picked.length)).map((m) => m.id) : [],
      );

      for (const moverId of designatedSet) {
        designatedMovers.push({
          id: designatedId,
          estimateRequestId: currentRequestId,
          moverId,
          createdAt,
        });
        designatedId += 1;
      }

      /*
       * 확정 대상 견적을 미리 정한다.
       * COMPLETED / CONFIRMED 는 반드시 확정 견적이 하나 있어야 하고,
       * EXPIRED / CANCELED 는 절대 있으면 안 된다.
       */

      for (let pi = 0; pi < picked.length; pi += 1) {
        const mover = picked[pi]!;

        // 견적은 요청 제출 후 ~ 이사일 사이에 도착한다
        /*
         * 견적 제출 시각은 아래를 모두 만족해야 한다.
         *   · 요청 생성 이후
         *   · 기사 가입 이후
         *   · 현재 이전 (아직 오지 않은 견적은 존재할 수 없다)
         *   · 이사일 이전
         */
        const estimateWindowStart = Math.max(
          createdAt.getTime() + 60 * 60_000,
          mover.createdAt.getTime() + 60 * 60_000,
        );

        const estimateWindowEnd = Math.min(now.getTime(), moveDateOnly.getTime() - 60 * 60_000);

        /*
         * 창이 뒤집히는 경우(기사가 요청 직전에 가입 / 이사일이 코앞)에도
         * 현재를 넘어서면 안 된다. 요청 생성 시각 이후라는 하한만 지키고
         * 상한은 무조건 now 로 자른다.
         */
        const estimateCreatedAt = new Date(
          Math.max(
            createdAt.getTime(),
            Math.min(
              now.getTime(),
              estimateWindowEnd <= estimateWindowStart
                ? estimateWindowStart
                : estimateWindowStart + rng() * (estimateWindowEnd - estimateWindowStart),
            ),
          ),
        );

        const isConfirmed = pi === confirmedIndex;

        /*
         * 견적 상태
         *  - 확정 대상        → CONFIRMED
         *  - 확정된 요청의 나머지 → EXPIRED (선택되지 못함)
         *  - 만료된 요청       → EXPIRED
         *  - 취소된 요청       → CANCELED
         *  - 진행 중          → SENT
         */
        const estimateStatus = isConfirmed
          ? "CONFIRMED"
          : status === "COMPLETED" || status === "CONFIRMED"
            ? "EXPIRED"
            : status === "EXPIRED"
              ? "EXPIRED"
              : status === "CANCELED"
                ? "CANCELED"
                : "SENT";

        const confirmedAt = isConfirmed
          ? new Date(
              Math.max(
                estimateCreatedAt.getTime(),
                Math.min(
                  now.getTime(),
                  moveDateOnly.getTime(),
                  estimateCreatedAt.getTime() + randInt(rng, 1, 72) * 3_600_000,
                ),
              ),
            )
          : null;

        const currentEstimateId = estimateId;
        estimateId += 1;

        touch(mover.id, estimateCreatedAt);

        estimates.push({
          id: currentEstimateId,
          estimateRequestId: currentRequestId,
          moverId: mover.id,
          price: priceFor(rng, moveType),
          comment: makeQuoteComment(rng),
          status: estimateStatus,
          isDesignated: designatedSet.has(mover.id),
          createdAt: estimateCreatedAt,
          updatedAt: confirmedAt ?? estimateCreatedAt,
          confirmedAt,
          expiredAt: estimateStatus === "EXPIRED" ? expiresAt : null,
          canceledAt: estimateStatus === "CANCELED" ? canceledAt : null,
        });

        if (isConfirmed) {
          confirmedLinks.push({ requestId: currentRequestId, estimateId: currentEstimateId });
          confirmedByMover.set(mover.id, (confirmedByMover.get(mover.id) ?? 0) + 1);

          /* ── 채팅방 (확정 견적당 1개) ───────────────────────────── */

          const roomCreatedAt = confirmedAt ?? estimateCreatedAt;
          const currentRoomId = chatRoomId;
          chatRoomId += 1;

          let lastMessageAt: Date | null = null;

          if (chance(rng, config.chatActiveRatio)) {
            const messageCount = randInt(rng, 2, 24);
            let cursor = roomCreatedAt;

            for (let mi = 0; mi < messageCount; mi += 1) {
              const fromCustomer = mi % 2 === 0;
              cursor = addMinutes(cursor, randInt(rng, 2, 240));

              // 아직 오지 않은 메시지는 있을 수 없다
              if (cursor.getTime() > now.getTime()) {
                break;
              }

              chatMessages.push({
                id: chatMessageId,
                roomId: currentRoomId,
                senderId: fromCustomer ? customer.id : mover.id,
                type: "TEXT",
                content: makeChatMessage(rng, fromCustomer),
                imageUrl: null,
                isRead: isPastStatus || chance(rng, 0.7),
                readAt: isPastStatus
                  ? new Date(
                      Math.min(now.getTime(), cursor.getTime() + randInt(rng, 1, 120) * 60_000),
                    )
                  : null,
                createdAt: cursor,
              });
              chatMessageId += 1;
              lastMessageAt = cursor;
            }
          }

          chatRooms.push({
            id: currentRoomId,
            estimateRequestId: currentRequestId,
            estimateId: currentEstimateId,
            customerId: customer.id,
            moverId: mover.id,
            lastMessageAt,
            createdAt: roomCreatedAt,
            updatedAt: lastMessageAt ?? roomCreatedAt,
          });

          /* ── 리뷰 (COMPLETED 의 80%) ────────────────────────────── */

          if (status === "COMPLETED" && chance(rng, config.reviewWrittenRatio)) {
            const rating = pickRating(rng);

            // 리뷰는 반드시 이사일 이후에 작성된다
            const reviewCreatedAt = new Date(
              moveDate.getTime() +
                randInt(rng, 1, 30) * 86_400_000 +
                randInt(rng, 0, 82_800) * 1_000,
            );

            reviews.push({
              id: reviewId,
              customerId: customer.id,
              moverId: mover.id,
              estimateId: currentEstimateId,
              rating,
              content: makeReviewContent(rng, rating),
              isHidden: chance(rng, 0.004),
              createdAt: reviewCreatedAt > now ? now : reviewCreatedAt,
              updatedAt: reviewCreatedAt > now ? now : reviewCreatedAt,
            });
            reviewId += 1;
            reviewsByMover.set(mover.id, (reviewsByMover.get(mover.id) ?? 0) + 1);
          }
        }
      }

      /* ── 반려 (견적을 내지 않은 기사 중 일부) ────────────────────── */

      if (chance(rng, REJECTION_RATE) && candidatePool.length > picked.length) {
        const pickedIds = new Set(picked.map((m) => m.id));
        let rejector: SeedMover | undefined;

        for (let i = 0; i < eligibleSize; i += 1) {
          const candidate = candidatePool[i]!;

          if (!pickedIds.has(candidate.id)) {
            rejector = candidate;
            break;
          }
        }

        if (rejector) {
          estimateRequestRejections.push({
            id: rejectionId,
            estimateRequestId: currentRequestId,
            moverId: rejector.id,
            reason: makeRejectionReason(rng),
            createdAt: new Date(
              Math.min(now.getTime(), createdAt.getTime() + randInt(rng, 30, 2_000) * 60_000),
            ),
          });
          rejectionId += 1;
        }
      }
    }
  }

  return {
    rows: {
      estimateRequests,
      estimateRequestHistories,
      designatedMovers,
      estimates,
      estimateRequestRejections,
      reviews,
      chatRooms,
      chatMessages,
    },
    confirmedLinks,
    events: { reviewsByMover, confirmedByMover },
    lastActivityByUser,
    stats: {
      requests: estimateRequests.length,
      estimates: estimates.length,
      reviews: reviews.length,
      chatRooms: chatRooms.length,
      chatMessages: chatMessages.length,
    },
  };
}
