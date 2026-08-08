import type { PrismaClient } from "@prisma/client";

import { FAQS, INQUIRIES, NOTICES } from "./adminContents.js";

/**
 * 관리자 기능 테스트 데이터를 생성합니다.
 *
 * 공지사항 / FAQ / 1:1 문의 / 신고 / 정지 이력 / 활동 로그를 만듭니다.
 * 여러 번 실행해도 중복이 쌓이지 않도록 기존 데이터를 먼저 정리합니다.
 */
export async function seedAdminContents(prisma: PrismaClient, adminIds: string[]): Promise<void> {
  const adminId = adminIds[0];

  if (adminId === undefined) {
    console.log("관리자 계정이 없어 관리자 콘텐츠 시드를 건너뜁니다.");

    return;
  }

  const customers = await prisma.user.findMany({
    where: { role: "CUSTOMER" },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });

  const movers = await prisma.user.findMany({
    where: { role: "MOVER" },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });

  /*
   * 레거시 인덱스 참조(customers[0] 등)를 없애고 email 로 명시 조회한다.
   * 계정은 항상 100명 생성되므로 아래 대상은 존재가 보장된다.
   */
  const customerByEmail = new Map(customers.map((u) => [u.email, u]));
  const moverByEmail = new Map(movers.map((u) => [u.email, u]));
  const pickCustomer = (email: string) => customerByEmail.get(email);
  const pickMover = (email: string) => moverByEmail.get(email);

  if (customers.length === 0 || movers.length === 0) {
    console.log("고객 또는 기사 계정이 없어 관리자 콘텐츠 시드를 건너뜁니다.");

    return;
  }

  /**
   * 재실행 시 중복을 막기 위해 먼저 삭제합니다.
   * 자식 레코드가 Cascade 로 함께 지워지는 순서를 지켜야 합니다.
   */
  await prisma.activityLog.deleteMany();
  await prisma.inquiryMessage.deleteMany();
  await prisma.inquiry.deleteMany();
  await prisma.report.deleteMany();
  await prisma.userSuspension.deleteMany();
  await prisma.faq.deleteMany();
  await prisma.notice.deleteMany();

  /* 공지사항 --------------------------------------------------------------- */

  console.log("공지사항을 생성합니다.");

  for (const notice of NOTICES) {
    await prisma.notice.create({
      data: {
        authorId: adminId,
        title: notice.title,
        content: notice.content,
        audience: notice.audience,
        isPinned: notice.isPinned,
        isVisible: notice.isVisible ?? true,
        sendNotification: notice.sendNotification,
        viewCount: Math.floor(Math.random() * 200),
      },
    });
  }

  console.log(`공지사항 ${NOTICES.length}건 생성 완료`);

  /* FAQ -------------------------------------------------------------------- */

  console.log("FAQ 를 생성합니다.");

  for (const faq of FAQS) {
    await prisma.faq.create({
      data: {
        authorId: adminId,
        question: faq.question,
        answer: faq.answer,
        sortOrder: faq.sortOrder,
        isVisible: faq.isVisible ?? true,
      },
    });
  }

  console.log(`FAQ ${FAQS.length}건 생성 완료`);

  /* 1:1 문의 --------------------------------------------------------------- */

  console.log("1:1 문의를 생성합니다.");

  for (const inquiry of INQUIRIES) {
    const author = customers[inquiry.authorIndex % customers.length];

    if (author === undefined) {
      continue;
    }

    const isHandled = inquiry.status !== "OPEN";

    const created = await prisma.inquiry.create({
      data: {
        authorId: author.id,
        category: inquiry.category,
        title: inquiry.title,
        status: inquiry.status,
        handledBy: isHandled ? adminId : null,
        closedAt: inquiry.status === "CLOSED" ? new Date() : null,
      },
    });

    let lastMessageAt: Date | null = null;

    for (const [index, message] of inquiry.messages.entries()) {
      /** 메시지가 순서대로 쌓이도록 1분씩 차이를 둡니다. */
      const createdAt = new Date(Date.now() - (inquiry.messages.length - index) * 60_000);

      await prisma.inquiryMessage.create({
        data: {
          inquiryId: created.id,
          senderId: message.isAdmin ? adminId : author.id,
          content: message.content,
          isAdmin: message.isAdmin,
          isRead: message.isAdmin,
          createdAt,
        },
      });

      lastMessageAt = createdAt;
    }

    await prisma.inquiry.update({
      where: { id: created.id },
      data: { lastMessageAt },
    });
  }

  console.log(`💬 1:1 문의 ${INQUIRIES.length}건 생성 완료`);

  /* 신고 ------------------------------------------------------------------- */

  console.log("🚨 신고 데이터를 생성합니다.");

  const reviews = await prisma.review.findMany({
    select: { id: true },
    take: 2,
    orderBy: { id: "asc" },
  });

  let reportCount = 0;

  /** 리뷰 신고 (처리 대기) */
  const firstReview = reviews[0];
  const reporter0 = pickCustomer("customer001@test.com");

  if (firstReview !== undefined && reporter0 !== undefined) {
    await prisma.report.create({
      data: {
        targetType: "REVIEW",
        targetId: String(firstReview.id),
        reporterId: reporter0.id,
        reason: "ABUSE",
        detail: "욕설이 포함된 리뷰입니다.",
        status: "PENDING",
      },
    });

    reportCount += 1;
  }

  /** 리뷰 신고 (처리 완료 - 숨김 처리됨) */
  const secondReview = reviews[1];
  const reporter1 = pickCustomer("customer002@test.com");

  if (secondReview !== undefined && reporter1 !== undefined) {
    await prisma.report.create({
      data: {
        targetType: "REVIEW",
        targetId: String(secondReview.id),
        reporterId: reporter1.id,
        reason: "FALSE_INFO",
        detail: "사실과 다른 내용입니다.",
        status: "RESOLVED",
        handledBy: adminId,
        handledAt: new Date(),
        handlerNote: "확인 후 숨김 처리했습니다.",
      },
    });

    await prisma.review.update({
      where: { id: secondReview.id },
      data: { isHidden: true },
    });

    reportCount += 1;
  }

  /** 기사 신고 (처리 대기) */
  const reporter2 = pickCustomer("customer003@test.com");
  const reportedMover = pickMover("mover001@test.com");

  if (reporter2 !== undefined && reportedMover !== undefined) {
    await prisma.report.create({
      data: {
        targetType: "MOVER",
        targetId: reportedMover.id,
        reporterId: reporter2.id,
        reason: "INAPPROPRIATE",
        detail: "약속한 시간에 나타나지 않았습니다.",
        status: "PENDING",
      },
    });

    reportCount += 1;
  }

  console.log(`신고 ${reportCount}건 생성 완료`);

  /* 정지 이력 -------------------------------------------------------------- */

  console.log("정지 이력을 생성합니다.");

  let suspensionCount = 0;

  /*
   * 정지 대상 = 각 10명 배치의 9번 위치.
   *   고객: customer009, 019, 029, ... 099  (10명)
   *   기사: mover009,   019, 029, ... 099   (10명)
   * 규칙 기반으로 통일해 100번까지 일관되게 정지 상태를 만든다.
   */
  const SUSPEND_REASONS = [
    {
      reason: "허위 리뷰 작성으로 인한 이용 제한입니다.",
      internalNote: "동일 IP 에서 리뷰 5건 연속 작성 확인",
    },
    {
      reason: "반복적인 노쇼로 인한 이용 제한입니다.",
      internalNote: "최근 30일 내 예약 부도 3회 확인",
    },
    {
      reason: "부적절한 채팅 메시지 신고 누적으로 인한 이용 제한입니다.",
      internalNote: "욕설 신고 다건 접수",
    },
    {
      reason: "허위 견적 및 노쇼 신고 누적으로 인한 이용 제한입니다.",
      internalNote: "확정 후 미방문 신고 다건 접수",
    },
  ] as const;

  const pad3 = (n: number) => String(n).padStart(3, "0");
  const suspendTargets = [] as { user: ReturnType<typeof pickCustomer>; seq: number }[];

  for (let batch = 0; batch < 10; batch += 1) {
    const no = batch * 10 + 9; // 9, 19, 29, ... 99
    suspendTargets.push({ user: pickCustomer(`customer${pad3(no)}@test.com`), seq: batch });
    suspendTargets.push({ user: pickMover(`mover${pad3(no)}@test.com`), seq: batch });
  }

  for (const { user, seq } of suspendTargets) {
    if (user === undefined) {
      continue;
    }

    const info = SUSPEND_REASONS[seq % SUSPEND_REASONS.length]!;

    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });

    await prisma.userSuspension.create({
      data: {
        userId: user.id,
        adminId,
        action: "SUSPEND",
        reason: info.reason,
        internalNote: info.internalNote,
      },
    });

    suspensionCount += 1;
  }

  // 활동 로그(hide memo) 등에서 참조할 대표 정지 계정
  const suspendedUser = pickCustomer("customer009@test.com");

  /*
   * 정지 → 해제된 회원 = 각 10명 배치의 10번 위치.
   *   고객: customer010, 020, ... 100
   *   기사: mover010,   020, ... 100
   * SUSPEND 후 RELEASE 이력을 남기되, 최종 상태는 active(해제됨)로 둔다.
   * (user.isActive 를 false 로 바꾸지 않으므로 현재 이용 가능 상태)
   */
  const releasedTargets = [] as ReturnType<typeof pickCustomer>[];
  for (let batch = 0; batch < 10; batch += 1) {
    const no = batch * 10 + 10; // 10, 20, ... 100
    releasedTargets.push(pickCustomer(`customer${pad3(no)}@test.com`));
    releasedTargets.push(pickMover(`mover${pad3(no)}@test.com`));
  }

  for (const releasedUser of releasedTargets) {
    if (releasedUser === undefined) {
      continue;
    }

    await prisma.userSuspension.create({
      data: {
        userId: releasedUser.id,
        adminId,
        action: "SUSPEND",
        reason: "부적절한 언행으로 인한 이용 제한입니다.",
      },
    });

    await prisma.userSuspension.create({
      data: {
        userId: releasedUser.id,
        adminId,
        action: "RELEASE",
        reason: "이의 제기 확인 후 정지를 해제합니다.",
        internalNote: "오인 신고로 판단",
      },
    });

    suspensionCount += 2;
  }

  console.log(`🔒 정지 이력 ${suspensionCount}건 생성 완료`);

  /* 활동 로그 -------------------------------------------------------------- */

  console.log("📝 활동 로그를 생성합니다.");

  const notices = await prisma.notice.findMany({ select: { id: true }, take: 3 });
  const faqs = await prisma.faq.findMany({ select: { id: true }, take: 2 });
  const estimateRequests = await prisma.estimateRequest.findMany({
    select: { id: true, customerId: true },
    take: 3,
  });

  type LogInput = {
    actorId: string;
    actorRole: "ADMIN" | "CUSTOMER" | "MOVER";
    action: "CREATE" | "UPDATE" | "DELETE";
    targetType:
      "USER" | "REVIEW" | "ESTIMATE_REQUEST" | "ESTIMATE" | "NOTICE" | "FAQ" | "INQUIRY" | "REPORT";
    targetId: string;
    memo?: string;
    createdAt: Date;
  };

  const logs: LogInput[] = [];
  let offset = 0;

  /** 오래된 순으로 쌓이도록 시간을 벌립니다. */
  const nextTime = (): Date => {
    offset += 1;

    return new Date(Date.now() - offset * 37 * 60_000);
  };

  for (const notice of notices) {
    logs.push({
      actorId: adminId,
      actorRole: "ADMIN",
      action: "CREATE",
      targetType: "NOTICE",
      targetId: String(notice.id),
      createdAt: nextTime(),
    });
  }

  for (const faq of faqs) {
    logs.push({
      actorId: adminId,
      actorRole: "ADMIN",
      action: "CREATE",
      targetType: "FAQ",
      targetId: String(faq.id),
      createdAt: nextTime(),
    });
  }

  if (suspendedUser !== undefined) {
    logs.push({
      actorId: adminId,
      actorRole: "ADMIN",
      action: "UPDATE",
      targetType: "USER",
      targetId: suspendedUser.id,
      memo: "허위 리뷰 작성으로 계정 정지",
      createdAt: nextTime(),
    });
  }

  if (secondReview !== undefined) {
    logs.push({
      actorId: adminId,
      actorRole: "ADMIN",
      action: "UPDATE",
      targetType: "REVIEW",
      targetId: String(secondReview.id),
      memo: "신고 접수 후 숨김 처리",
      createdAt: nextTime(),
    });
  }

  for (const request of estimateRequests) {
    logs.push({
      actorId: request.customerId,
      actorRole: "CUSTOMER",
      action: "CREATE",
      targetType: "ESTIMATE_REQUEST",
      targetId: String(request.id),
      createdAt: nextTime(),
    });
  }

  const firstRequest = estimateRequests[0];

  if (firstRequest !== undefined) {
    logs.push({
      actorId: firstRequest.customerId,
      actorRole: "CUSTOMER",
      action: "UPDATE",
      targetType: "ESTIMATE_REQUEST",
      targetId: String(firstRequest.id),
      createdAt: nextTime(),
    });
  }

  await prisma.activityLog.createMany({ data: logs });

  console.log(`활동 로그 ${logs.length}건 생성 완료`);
}
