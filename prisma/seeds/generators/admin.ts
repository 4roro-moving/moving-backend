/*
 * 관리자 영역: 공지 / FAQ / 문의 / 신고 / 정지이력 / 활동로그
 * ============================================================================
 *
 *  ── 지켜야 할 것 ───────────────────────────────────────────────────────
 *   · Report @@unique([targetType, targetId, reporterId]) — 중복 신고 불가
 *   · Report.status=RESOLVED/REJECTED 이면 handledBy, handledAt 이 있어야 함
 *   · Inquiry.lastMessageAt 은 실제 마지막 메시지 시각과 일치
 *   · InquiryMessage.isAdmin 은 sender.role 과 모순되면 안 됨
 *   · UserSuspension 은 User.isActive 와 일관 (정지 계정은 SUSPEND 가 마지막)
 *   · ActivityLog: action=HIDE 이면 memo 필수 (DB CHECK 제약이 걸려 있음)
 * ============================================================================
 */

import type { SeedConfig } from "../config.js";
import { isReleased, isSuspended } from "../anchors/index.js";
import { pickSeasonalPastDate } from "../lib/distributions.js";
import { chance, deriveRng, pick, randInt, sampleIndices, type Rng } from "../lib/rng.js";
import type { SeedCustomer, SeedMover, SeedUser } from "./users.js";

interface ReportTargets {
  reviews: { id: number; createdAt: Date }[];
  residenceReviews: { id: number; createdAt: Date }[];
  giveaways: { id: number; createdAt: Date }[];
}

export interface AdminResult {
  rows: {
    notices: unknown[];
    faqs: unknown[];
    inquiries: unknown[];
    inquiryMessages: unknown[];
    reports: unknown[];
    userSuspensions: unknown[];
    activityLogs: unknown[];
  };
}

const NOTICE_TOPICS = [
  [
    "서비스 점검 안내",
    "보다 안정적인 서비스 제공을 위해 시스템 점검을 진행합니다. 점검 시간 동안 일부 기능 이용이 제한될 수 있습니다.",
  ],
  [
    "개인정보 처리방침 개정 안내",
    "개인정보 처리방침이 개정되어 안내드립니다. 주요 변경 사항은 공지 본문을 확인해 주세요.",
  ],
  [
    "설 연휴 이사 예약 안내",
    "연휴 기간에는 기사님 배정이 평소보다 오래 걸릴 수 있습니다. 여유 있게 예약해 주시기 바랍니다.",
  ],
  [
    "신규 기능 업데이트",
    "채팅으로 견적 조율이 가능한 기능이 추가되었습니다. 기사님과 직접 일정을 협의해 보세요.",
  ],
  ["악성 리뷰 신고 기능 개선", "부적절한 리뷰를 더 쉽게 신고할 수 있도록 기능을 개선했습니다."],
  [
    "여름 성수기 이사 안내",
    "6~8월은 이사 수요가 몰리는 시기입니다. 최소 2주 전 예약을 권장드립니다.",
  ],
  [
    "기사님 정산 주기 변경 안내",
    "정산 주기가 월 2회로 변경됩니다. 자세한 내용은 본문을 참고해 주세요.",
  ],
  ["고객센터 운영시간 변경", "고객센터 운영시간이 평일 09:00~18:00으로 조정됩니다."],
] as const;

const FAQ_ITEMS = [
  [
    "견적은 몇 개까지 받을 수 있나요?",
    "일반 요청은 최대 5개, 지정 요청은 최대 3개까지 견적을 받으실 수 있습니다.",
  ],
  [
    "견적 요청을 취소하려면 어떻게 하나요?",
    "마이페이지 > 견적 요청 내역에서 진행 중인 요청을 선택해 취소하실 수 있습니다. 이미 확정된 견적은 고객센터로 문의해 주세요.",
  ],
  [
    "리뷰는 언제 작성할 수 있나요?",
    "이사가 완료된 건에 한해 작성하실 수 있습니다. 완료 처리 후 마이페이지에 작성 가능한 목록이 표시됩니다.",
  ],
  [
    "기사님을 지정해서 요청할 수 있나요?",
    "네, 기사님 상세 페이지에서 지정 견적 요청이 가능합니다. 최대 3명까지 지정하실 수 있습니다.",
  ],
  ["견적 요청은 언제 만료되나요?", "이사 예정일 하루 전에 자동으로 만료됩니다."],
  [
    "계정이 정지되었는데 어떻게 하나요?",
    "1:1 문의에서 '정지 이의 제기' 분류로 문의를 남겨주시면 관리자가 확인 후 답변드립니다.",
  ],
  ["비밀번호를 잊어버렸어요.", "로그인 화면의 비밀번호 찾기를 통해 재설정하실 수 있습니다."],
  [
    "소셜 로그인 계정을 일반 계정으로 바꿀 수 있나요?",
    "현재는 계정당 하나의 로그인 방식만 지원하며, 방식 변경은 지원하지 않습니다.",
  ],
  [
    "이사 당일 짐이 늘어나면 어떻게 하나요?",
    "기사님과 채팅으로 협의하여 견적 수정 요청을 보내실 수 있습니다.",
  ],
  ["나눔 글은 누구나 작성할 수 있나요?", "일반 회원이라면 누구나 작성하실 수 있습니다."],
] as const;

const INQUIRY_TITLES = [
  ["SUSPENSION_APPEAL", "계정 정지 관련 문의드립니다"],
  ["SUSPENSION_APPEAL", "정지 사유를 알고 싶습니다"],
  ["ACCOUNT", "이메일 주소를 변경하고 싶습니다"],
  ["ACCOUNT", "탈퇴 후 재가입이 가능한가요?"],
  ["ACCOUNT", "소셜 로그인이 되지 않습니다"],
  ["SERVICE", "견적 요청이 등록되지 않습니다"],
  ["SERVICE", "기사님과 연락이 닿지 않습니다"],
  ["SERVICE", "리뷰 작성 버튼이 보이지 않습니다"],
  ["SERVICE", "확정한 견적을 취소하고 싶습니다"],
  ["ETC", "제휴 문의드립니다"],
  ["ETC", "앱 오류 제보합니다"],
] as const;

const INQUIRY_BODIES = [
  "안녕하세요. 문의 사항이 있어 글 남깁니다. 확인 후 답변 부탁드립니다.",
  "며칠째 같은 증상이 반복되고 있어 문의드립니다. 빠른 확인 부탁드려요.",
  "앱과 웹 모두 시도해 봤는데 동일합니다. 어떻게 해야 할까요?",
  "고객센터 운영시간에 전화가 어려워 여기에 남깁니다.",
] as const;

const ADMIN_REPLIES = [
  "안녕하세요, 무빙 고객센터입니다. 문의해 주셔서 감사합니다. 확인 후 순차적으로 처리해 드리겠습니다.",
  "불편을 드려 죄송합니다. 말씀해 주신 내용을 담당 부서에 전달했으며, 확인되는 대로 안내드리겠습니다.",
  "확인 결과 해당 건은 정상 처리되었습니다. 추가로 궁금하신 점 있으시면 언제든 문의 주세요.",
  "요청하신 내용은 현재 정책상 지원이 어려운 점 양해 부탁드립니다. 대안을 함께 안내드리겠습니다.",
] as const;

const REPORT_REASONS = [
  "SPAM",
  "ABUSE",
  "FALSE_INFO",
  "INAPPROPRIATE",
  "PRIVACY",
  "OTHER",
] as const;

const HIDE_MEMOS = [
  "욕설 및 비방 표현이 포함되어 숨김 처리했습니다.",
  "광고성 내용으로 판단되어 숨김 처리했습니다.",
  "개인정보가 노출되어 숨김 처리했습니다.",
  "허위 사실 기재로 확인되어 숨김 처리했습니다.",
] as const;

function generateNotices(rng: Rng, config: SeedConfig, admins: SeedUser[], now: Date): unknown[] {
  const rows: unknown[] = [];

  for (let i = 0; i < config.notices; i += 1) {
    const topic = NOTICE_TOPICS[i % NOTICE_TOPICS.length]!;
    const author = admins[randInt(rng, 0, admins.length - 1)]!;
    // 공지 수가 많으면 역산 날짜가 관리자 가입일보다 앞설 수 있다
    const createdAt = new Date(
      Math.max(
        author.createdAt.getTime(),
        now.getTime() - (config.notices - i) * randInt(rng, 3, 20) * 86_400_000,
      ),
    );

    rows.push({
      id: i + 1,
      authorId: author.id,
      title: config.notices > NOTICE_TOPICS.length ? `${topic[0]} (${i + 1})` : topic[0],
      content: topic[1],
      audience: pick(rng, ["ALL", "ALL", "ALL", "CUSTOMER", "MOVER"] as const),
      isPinned: i < 2,
      isVisible: chance(rng, 0.92),
      sendNotification: chance(rng, 0.35),
      viewCount: randInt(rng, 0, 4_800),
      createdAt,
      updatedAt: createdAt,
    });
  }

  return rows;
}

function generateFaqs(rng: Rng, config: SeedConfig, admins: SeedUser[], now: Date): unknown[] {
  const rows: unknown[] = [];

  for (let i = 0; i < config.faqs; i += 1) {
    const item = FAQ_ITEMS[i % FAQ_ITEMS.length]!;
    const author = admins[randInt(rng, 0, admins.length - 1)]!;
    const createdAt = new Date(
      Math.max(author.createdAt.getTime(), now.getTime() - randInt(rng, 30, 400) * 86_400_000),
    );

    rows.push({
      id: i + 1,
      authorId: author.id,
      question: config.faqs > FAQ_ITEMS.length ? `${item[0]} (${i + 1})` : item[0],
      answer: item[1],
      sortOrder: i,
      isVisible: chance(rng, 0.95),
      createdAt,
      updatedAt: createdAt,
    });
  }

  return rows;
}

function generateInquiries(
  rng: Rng,
  config: SeedConfig,
  admins: SeedUser[],
  members: SeedUser[],
  now: Date,
): { inquiries: unknown[]; messages: unknown[] } {
  const inquiries: unknown[] = [];
  const messages: unknown[] = [];

  let inquiryId = 1;
  let messageId = 1;

  /*
   * 정지된 계정은 반드시 이의 제기 문의를 갖도록 한다.
   * (정지 회원도 접근 가능한 창구라는 정책이 실제로 검증되어야 함)
   */
  const suspended = members.filter((m) => !m.isActive);
  const others = members.filter((m) => m.isActive);

  const targets: SeedUser[] = [
    ...suspended.slice(0, Math.min(suspended.length, Math.floor(config.inquiries * 0.3))),
    ...sampleIndices(
      rng,
      others.length,
      Math.max(
        0,
        config.inquiries - Math.min(suspended.length, Math.floor(config.inquiries * 0.3)),
      ),
    )
      .map((i) => others[i]!)
      .filter(Boolean),
  ];

  for (const author of targets) {
    const isAppeal = !author.isActive;
    const spec = isAppeal
      ? INQUIRY_TITLES[randInt(rng, 0, 1)]!
      : INQUIRY_TITLES[randInt(rng, 2, INQUIRY_TITLES.length - 1)]!;

    let createdAt = pickSeasonalPastDate(rng, now, 6);

    if (createdAt.getTime() < author.createdAt.getTime()) {
      createdAt = new Date(author.createdAt.getTime() + randInt(rng, 1, 30) * 86_400_000);
    }

    if (createdAt.getTime() > now.getTime()) {
      createdAt = new Date(now.getTime() - 86_400_000);
    }

    /*
     * 상태 흐름: OPEN → ANSWERED → CLOSED
     * ANSWERED 이상은 관리자 답변 메시지가 반드시 있어야 한다.
     */
    const status = pick(rng, ["OPEN", "ANSWERED", "ANSWERED", "CLOSED", "CLOSED"] as const);
    const handler = status === "OPEN" ? null : admins[randInt(rng, 0, admins.length - 1)]!;

    const currentId = inquiryId;
    inquiryId += 1;

    let lastMessageAt = createdAt;

    // 최초 문의 (작성자)
    messages.push({
      id: messageId,
      inquiryId: currentId,
      senderId: author.id,
      content: `${pick(rng, INQUIRY_BODIES)}`,
      isAdmin: false,
      isRead: status !== "OPEN",
      createdAt,
    });
    messageId += 1;

    if (handler) {
      const replyAt = new Date(
        Math.min(now.getTime(), createdAt.getTime() + randInt(rng, 1, 72) * 3_600_000),
      );

      messages.push({
        id: messageId,
        inquiryId: currentId,
        senderId: handler.id,
        content: pick(rng, ADMIN_REPLIES),
        isAdmin: true,
        isRead: chance(rng, 0.75),
        createdAt: replyAt,
      });
      messageId += 1;
      lastMessageAt = replyAt;

      // 일부는 재문의가 이어진다
      if (chance(rng, 0.3)) {
        const followUpAt = new Date(
          Math.min(now.getTime(), replyAt.getTime() + randInt(rng, 1, 48) * 3_600_000),
        );

        messages.push({
          id: messageId,
          inquiryId: currentId,
          senderId: author.id,
          content: "답변 감사합니다. 추가로 한 가지 더 여쭤보고 싶습니다.",
          isAdmin: false,
          isRead: status === "CLOSED",
          createdAt: followUpAt,
        });
        messageId += 1;
        lastMessageAt = followUpAt;
      }
    }

    inquiries.push({
      id: currentId,
      authorId: author.id,
      category: spec[0],
      title: spec[1],
      status,
      handledBy: handler?.id ?? null,
      closedAt:
        status === "CLOSED"
          ? new Date(Math.min(now.getTime(), lastMessageAt.getTime() + 86_400_000))
          : null,
      lastMessageAt,
      createdAt,
      updatedAt: lastMessageAt,
    });
  }

  return { inquiries, messages };
}

function generateReports(
  rng: Rng,
  config: SeedConfig,
  admins: SeedUser[],
  customers: SeedCustomer[],
  movers: SeedMover[],
  targets: ReportTargets,
  now: Date,
): unknown[] {
  const rows: unknown[] = [];

  /** @@unique([targetType, targetId, reporterId]) 충돌 방지 */
  const seen = new Set<string>();
  let id = 1;

  for (let i = 0; i < config.reports * 3 && rows.length < config.reports; i += 1) {
    const reporter = customers[randInt(rng, 0, customers.length - 1)]!;

    const targetType = pick(rng, [
      "REVIEW",
      "REVIEW",
      "MOVER",
      "RESIDENCE_REVIEW",
      "GIVEAWAY",
    ] as const);

    let targetId: string | null = null;
    /** 신고 대상이 만들어진 시각 — 이보다 앞서 신고할 수는 없다 */
    let targetBornAt: Date | null = null;

    if (targetType === "REVIEW" && targets.reviews.length > 0) {
      const t = targets.reviews[randInt(rng, 0, targets.reviews.length - 1)]!;
      targetId = String(t.id);
      targetBornAt = t.createdAt;
    } else if (targetType === "MOVER" && movers.length > 0) {
      const t = movers[randInt(rng, 0, movers.length - 1)]!;
      targetId = t.id;
      targetBornAt = t.createdAt;
    } else if (targetType === "RESIDENCE_REVIEW" && targets.residenceReviews.length > 0) {
      const t = targets.residenceReviews[randInt(rng, 0, targets.residenceReviews.length - 1)]!;
      targetId = String(t.id);
      targetBornAt = t.createdAt;
    } else if (targetType === "GIVEAWAY" && targets.giveaways.length > 0) {
      const t = targets.giveaways[randInt(rng, 0, targets.giveaways.length - 1)]!;
      targetId = String(t.id);
      targetBornAt = t.createdAt;
    }

    if (targetId === null || targetBornAt === null) {
      continue;
    }

    const key = `${targetType}|${targetId}|${reporter.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    /*
     * 신고 시각은 "대상이 생긴 이후" && "신고자가 가입한 이후" 여야 한다.
     * 이 창이 없으면 리뷰가 작성되기도 전에 그 리뷰를 신고한 데이터가 만들어진다.
     */
    const windowStart = Math.max(targetBornAt.getTime(), reporter.createdAt.getTime());

    if (windowStart >= now.getTime()) {
      seen.delete(key);
      continue;
    }

    const status = pick(rng, ["PENDING", "PENDING", "RESOLVED", "RESOLVED", "REJECTED"] as const);
    const handler = status === "PENDING" ? null : admins[randInt(rng, 0, admins.length - 1)]!;
    const createdAt = new Date(windowStart + rng() * (now.getTime() - windowStart));
    const handledAt = handler
      ? new Date(Math.min(now.getTime(), createdAt.getTime() + randInt(rng, 1, 120) * 3_600_000))
      : null;
    const reason = pick(rng, REPORT_REASONS);

    rows.push({
      id,
      targetType,
      targetId,
      reporterId: reporter.id,
      reason,
      detail: reason === "OTHER" ? "기타 사유로 신고합니다. 확인 부탁드립니다." : null,
      status,
      handledBy: handler?.id ?? null,
      handledAt,
      handlerNote: handler
        ? status === "RESOLVED"
          ? "확인 후 조치 완료했습니다."
          : "신고 사유에 해당하지 않아 반려합니다."
        : null,
      createdAt,
      updatedAt: handledAt ?? createdAt,
    });
    id += 1;
  }

  return rows;
}

function generateSuspensions(
  rng: Rng,
  admins: SeedUser[],
  customers: SeedCustomer[],
  movers: SeedMover[],
  lastActivityByUser: Map<string, Date>,
  now: Date,
): unknown[] {
  const rows: unknown[] = [];
  let id = 1;

  const targets: (SeedCustomer | SeedMover)[] = [...customers, ...movers];

  for (const user of targets) {
    const anchorIndex = user.anchorIndex;

    if (anchorIndex === null) {
      continue;
    }

    const suspendedNow = isSuspended(anchorIndex);
    const released = isReleased(anchorIndex);

    if (!suspendedNow && !released) {
      continue;
    }

    const admin = admins[randInt(rng, 0, admins.length - 1)]!;

    /*
     * 정지는 대상 계정이 가입한 이후에만 가능하다.
     *
     * 가입한 지 얼마 안 된 계정이면 창이 좁아지는데, 여기서 건너뛰면
     * User.isActive=false 인데 정지 이력이 없는 계정이 남는다.
     * 건너뛰지 말고 창을 좁혀서라도 반드시 만든다.
     */
    const joinedAt = user.createdAt.getTime();

    /*
     * 정지 시각은 그 계정의 "마지막 활동 이후"여야 한다.
     *
     * 활동보다 앞선 시각에 정지시키면 "정지된 계정이 그 뒤에 견적을 요청함"이
     * 되어 인증 미들웨어 동작과 모순된다. 해제되지 않은 계정일수록 중요하다.
     */
    const lastActive = lastActivityByUser.get(user.id)?.getTime() ?? joinedAt;
    const suspendWindowStart = Math.max(joinedAt + 60_000, lastActive + 3_600_000);

    const suspendedAt = new Date(
      suspendWindowStart >= now.getTime()
        ? now.getTime() - 60_000
        : suspendWindowStart + rng() * (now.getTime() - suspendWindowStart) * 0.7,
    );

    rows.push({
      id,
      userId: user.id,
      adminId: admin.id,
      action: "SUSPEND",
      reason: "서비스 이용약관 위반으로 계정이 정지되었습니다.",
      internalNote: "반복 신고 누적으로 정지 처리",
      createdAt: suspendedAt,
    });
    id += 1;

    /*
     * 해제 계정은 SUSPEND 다음에 RELEASE 가 와야 하고,
     * User.isActive 는 true 여야 한다 (users.ts 에서 이미 그렇게 만든다).
     */
    if (released) {
      rows.push({
        id,
        userId: user.id,
        adminId: admin.id,
        action: "RELEASE",
        reason: "이의 제기 확인 후 정지를 해제합니다.",
        internalNote: "소명 자료 확인 완료",
        createdAt: new Date(
          Math.min(now.getTime(), suspendedAt.getTime() + randInt(rng, 3, 30) * 86_400_000),
        ),
      });
      id += 1;
    }
  }

  return rows;
}

function generateActivityLogs(
  rng: Rng,
  admins: SeedUser[],
  customers: SeedCustomer[],
  movers: SeedMover[],
  hiddenReviews: { id: number; createdAt: Date }[],
  now: Date,
): unknown[] {
  const rows: unknown[] = [];
  let id = 1;

  /*
   * 숨김 처리된 리뷰에는 반드시 HIDE 로그가 있어야 하고,
   * memo 가 비어 있으면 DB CHECK 제약(activity_logs_hide_memo_required_check)에
   * 걸려 INSERT 자체가 실패한다.
   */
  for (const review of hiddenReviews) {
    const admin = admins[randInt(rng, 0, admins.length - 1)]!;

    // 숨김 처리는 리뷰가 작성된 이후에 이뤄진다
    const start = review.createdAt.getTime();
    const hiddenAt = new Date(start + rng() * Math.max(1, now.getTime() - start));

    rows.push({
      id,
      actorId: admin.id,
      actorRole: "ADMIN",
      action: "HIDE",
      targetType: "REVIEW",
      targetId: String(review.id),
      memo: pick(rng, HIDE_MEMOS),
      // 처리 관리자 가입 이후여야 한다
      createdAt: hiddenAt.getTime() < admin.createdAt.getTime() ? admin.createdAt : hiddenAt,
    });
    id += 1;
  }

  // 일반 사용자 활동 로그 (프로필 수정 등)
  const sampleUsers = [
    ...sampleIndices(rng, customers.length, Math.min(400, customers.length)).map(
      (i) => customers[i]!,
    ),
    ...sampleIndices(rng, movers.length, Math.min(200, movers.length)).map((i) => movers[i]!),
  ];

  for (const user of sampleUsers) {
    const count = randInt(rng, 1, 4);

    for (let i = 0; i < count; i += 1) {
      const createdAt = new Date(
        user.createdAt.getTime() +
          randInt(
            rng,
            1,
            Math.max(2, Math.floor((now.getTime() - user.createdAt.getTime()) / 86_400_000)),
          ) *
            86_400_000,
      );

      rows.push({
        id,
        actorId: user.id,
        actorRole: user.role,
        action: pick(rng, ["UPDATE", "UPDATE", "CREATE"] as const),
        targetType: user.role === "MOVER" ? "MOVER_PROFILE" : "USER",
        targetId: user.id,
        memo: null,
        createdAt: createdAt > now ? now : createdAt,
      });
      id += 1;
    }
  }

  return rows;
}

export function generateAdminContent(
  config: SeedConfig,
  admins: SeedUser[],
  customers: SeedCustomer[],
  movers: SeedMover[],
  context: ReportTargets & {
    hiddenReviews: { id: number; createdAt: Date }[];
    lastActivityByUser: Map<string, Date>;
  },
  now: Date,
): AdminResult {
  const rng = deriveRng(20260820, "admin");

  const notices = generateNotices(rng, config, admins, now);
  const faqs = generateFaqs(rng, config, admins, now);

  const members: SeedUser[] = [...customers, ...movers];
  const { inquiries, messages } = generateInquiries(rng, config, admins, members, now);

  const reports = generateReports(rng, config, admins, customers, movers, context, now);

  const userSuspensions = generateSuspensions(
    rng,
    admins,
    customers,
    movers,
    context.lastActivityByUser,
    now,
  );
  const activityLogs = generateActivityLogs(
    rng,
    admins,
    customers,
    movers,
    context.hiddenReviews,
    now,
  );

  return {
    rows: {
      notices,
      faqs,
      inquiries,
      inquiryMessages: messages,
      reports,
      userSuspensions,
      activityLogs,
    },
  };
}
