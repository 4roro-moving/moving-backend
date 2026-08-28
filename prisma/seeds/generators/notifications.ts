/*
 * 알림
 * ============================================================================
 *
 *  기존 시드에 없던 영역. 알림 목록이 항상 비어 있어 SSE·읽음 처리·만료
 *  스케줄러가 전혀 검증되지 않았다.
 *
 *  ── 제약 ───────────────────────────────────────────────────────────────
 *   @@unique([userId, type, sourceId])
 *     같은 사용자에게 같은 원본 이벤트로 같은 유형의 알림을 두 번 만들 수 없다.
 *     sourceId 를 이벤트 식별자(예: "estimate:12345")로 두면 자연히 지켜진다.
 *
 *  ── 정책 ───────────────────────────────────────────────────────────────
 *   최근 3일 이내 알림만 화면에 노출되므로, 대부분을 최근 구간에 만들되
 *   만료 정리(스케줄러) 대상도 일부 남겨둔다.
 * ============================================================================
 */

import { chance, deriveRng, randInt, sampleIndices } from "../lib/rng.js";
import type { SeedCustomer, SeedMover } from "./users.js";

type NotificationType =
  | "ESTIMATE_REQUEST_RECEIVED"
  | "DESIGNATED_REQUEST_RECEIVED"
  | "ESTIMATE_RECEIVED"
  | "ESTIMATE_CONFIRMED"
  | "ESTIMATE_REQUEST_REJECTED"
  | "MOVE_DAY_REMINDER"
  | "REVIEW_AVAILABLE"
  | "REVIEW_RECEIVED"
  | "CHAT_MESSAGE_RECEIVED"
  | "NOTICE_RECEIVED"
  | "INQUIRY_ANSWERED";

interface Template {
  type: NotificationType;
  title: string;
  content: string;
  /** 링크가 필요 없는 알림은 null */
  link: ((sourceId: string) => string) | null;
}

const CUSTOMER_TEMPLATES: Template[] = [
  {
    type: "ESTIMATE_RECEIVED",
    title: "견적 도착",
    content: "요청하신 이사 견적이 도착했습니다. 지금 확인해 보세요.",
    link: (id) => `/estimates/${id}`,
  },
  {
    type: "ESTIMATE_REQUEST_REJECTED",
    title: "견적 요청 반려",
    content: "기사님이 견적 요청을 반려했습니다. 다른 기사님을 찾아보세요.",
    link: (id) => `/estimate-requests/${id}`,
  },
  {
    type: "MOVE_DAY_REMINDER",
    title: "이사 당일 안내",
    content: "오늘은 이사 예정일입니다. 준비사항을 다시 확인해 주세요.",
    link: (id) => `/estimate-requests/${id}`,
  },
  {
    type: "REVIEW_AVAILABLE",
    title: "리뷰를 남겨주세요",
    content: "이사가 완료되었습니다. 기사님께 소중한 후기를 남겨주세요.",
    link: (id) => `/reviews/write/${id}`,
  },
  {
    type: "CHAT_MESSAGE_RECEIVED",
    title: "새 메시지",
    content: "기사님이 메시지를 보냈습니다.",
    link: (id) => `/chat/${id}`,
  },
];

const MOVER_TEMPLATES: Template[] = [
  {
    type: "ESTIMATE_REQUEST_RECEIVED",
    title: "새 견적 요청",
    content: "서비스 지역에 새로운 견적 요청이 등록되었습니다.",
    link: (id) => `/mover/requests/${id}`,
  },
  {
    type: "DESIGNATED_REQUEST_RECEIVED",
    title: "지정 견적 요청",
    content: "고객님이 회원님을 지정해 견적을 요청했습니다.",
    link: (id) => `/mover/requests/${id}`,
  },
  {
    type: "ESTIMATE_CONFIRMED",
    title: "견적 확정",
    content: "제출하신 견적이 확정되었습니다. 일정을 확인해 주세요.",
    link: (id) => `/mover/estimates/${id}`,
  },
  {
    type: "REVIEW_RECEIVED",
    title: "리뷰 도착",
    content: "고객님이 리뷰를 남겼습니다.",
    link: null,
  },
  {
    type: "CHAT_MESSAGE_RECEIVED",
    title: "새 메시지",
    content: "고객님이 메시지를 보냈습니다.",
    link: (id) => `/chat/${id}`,
  },
];

const SHARED_TEMPLATES: Template[] = [
  {
    type: "NOTICE_RECEIVED",
    title: "새 공지사항",
    content: "새로운 공지사항이 등록되었습니다.",
    link: (id) => `/notices/${id}`,
  },
  {
    type: "INQUIRY_ANSWERED",
    title: "문의 답변 완료",
    content: "문의하신 내용에 관리자가 답변했습니다.",
    link: (id) => `/inquiries/${id}`,
  },
];

export function generateNotifications(
  customers: SeedCustomer[],
  movers: SeedMover[],
  now: Date,
): unknown[] {
  const rng = deriveRng(20260820, "notifications");
  const rows: unknown[] = [];

  let id = 1;
  let eventSeq = 1;

  const emit = (
    user: { id: string; createdAt: Date },
    template: Template,
    rawCreatedAt: Date,
    { expired }: { expired: boolean },
  ): void => {
    /*
     * 가입 전에 알림이 도착할 수는 없다.
     * 최근 3일 구간에서 뽑으므로, 며칠 전에 가입한 계정이면 창이 좁아진다.
     */
    if (user.createdAt.getTime() > now.getTime()) {
      return;
    }

    const createdAt =
      rawCreatedAt.getTime() < user.createdAt.getTime()
        ? new Date(user.createdAt.getTime() + rng() * (now.getTime() - user.createdAt.getTime()))
        : rawCreatedAt;

    const userId = user.id;
    /*
     * sourceId 를 매번 새로운 값으로 두면 unique 제약과 충돌하지 않는다.
     * 실제 서비스에서는 "estimate:123" 처럼 원본 이벤트 키가 들어간다.
     */
    const sourceId = `seed-${template.type.toLowerCase()}-${eventSeq}`;
    eventSeq += 1;

    const isRead = chance(rng, 0.55);

    rows.push({
      id,
      userId,
      type: template.type,
      title: template.title,
      content: template.content,
      linkUrl: template.link ? template.link(String(randInt(rng, 1, 9999))) : null,
      isRead,
      readAt: isRead
        ? new Date(Math.min(now.getTime(), createdAt.getTime() + randInt(rng, 60, 86_400) * 1_000))
        : null,
      // 노출 기준 3일. 만료된 건도 일부 남겨 스케줄러 정리 대상을 만든다.
      expiresAt: new Date(createdAt.getTime() + (expired ? -86_400_000 : 3 * 86_400_000)),
      sourceId,
      createdAt,
    });
    id += 1;
  };

  /*
   * 전 계정에 알림을 다 만들면 3만 x N 건이 되어 과하다.
   * 활성 계정의 일부만 골라 최근 알림을 만든다.
   */
  const customerTargets = sampleIndices(
    rng,
    customers.length,
    Math.min(customers.length, Math.ceil(customers.length * 0.45)),
  ).map((i) => customers[i]!);

  const moverTargets = sampleIndices(
    rng,
    movers.length,
    Math.min(movers.length, Math.ceil(movers.length * 0.65)),
  ).map((i) => movers[i]!);

  for (const customer of customerTargets) {
    if (!customer.isActive) {
      continue;
    }

    const count = randInt(rng, 1, 8);

    for (let i = 0; i < count; i += 1) {
      const expired = chance(rng, 0.25);
      const daysAgo = expired ? randInt(rng, 5, 40) : randInt(rng, 0, 3);
      const createdAt = new Date(
        now.getTime() - daysAgo * 86_400_000 - randInt(rng, 0, 86_400) * 1_000,
      );

      const pool = chance(rng, 0.85) ? CUSTOMER_TEMPLATES : SHARED_TEMPLATES;
      const template = pool[randInt(rng, 0, pool.length - 1)]!;

      emit(customer, template, createdAt, { expired });
    }
  }

  for (const mover of moverTargets) {
    if (!mover.isActive) {
      continue;
    }

    const count = randInt(rng, 1, 12);

    for (let i = 0; i < count; i += 1) {
      const expired = chance(rng, 0.25);
      const daysAgo = expired ? randInt(rng, 5, 40) : randInt(rng, 0, 3);
      const createdAt = new Date(
        now.getTime() - daysAgo * 86_400_000 - randInt(rng, 0, 86_400) * 1_000,
      );

      const pool = chance(rng, 0.85) ? MOVER_TEMPLATES : SHARED_TEMPLATES;
      const template = pool[randInt(rng, 0, pool.length - 1)]!;

      emit(mover, template, createdAt, { expired });
    }
  }

  return rows;
}
