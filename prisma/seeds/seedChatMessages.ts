import type { PrismaClient } from "@prisma/client";

import { customerEmail } from "./customers.js";
import { moverEmail } from "./movers.js";

const CHAT_TEST_CUSTOMER_EMAIL = customerEmail(17);
const CHAT_TEST_MOVER_EMAIL = moverEmail(17);
const CHAT_TEST_MESSAGE_COUNT = 90;

function addMinutes(baseDate: Date, minutes: number): Date {
  const date = new Date(baseDate);
  date.setMinutes(date.getMinutes() + minutes);

  return date;
}

function buildChatMessageContent(index: number, isCustomer: boolean): string {
  const order = String(index + 1).padStart(2, "0");

  if (isCustomer) {
    return `[테스트 ${order}] 이사 일정과 짐 목록을 확인하고 싶습니다.`;
  }

  return `[테스트 ${order}] 확인했습니다. 채팅 메시지 페이지네이션 테스트용 답변입니다.`;
}

export async function seedChatMessages(prisma: PrismaClient): Promise<void> {
  console.log("💬 채팅 테스트 메시지 데이터를 생성합니다.");

  const [customer, mover] = await Promise.all([
    prisma.user.findUnique({
      where: { email: CHAT_TEST_CUSTOMER_EMAIL },
      select: { id: true, email: true },
    }),
    prisma.user.findUnique({
      where: { email: CHAT_TEST_MOVER_EMAIL },
      select: { id: true, email: true },
    }),
  ]);

  if (!customer) {
    throw new Error(`채팅 테스트 고객 계정을 찾을 수 없습니다: ${CHAT_TEST_CUSTOMER_EMAIL}`);
  }

  if (!mover) {
    throw new Error(`채팅 테스트 기사 계정을 찾을 수 없습니다: ${CHAT_TEST_MOVER_EMAIL}`);
  }

  const estimateRequest = await prisma.estimateRequest.findFirst({
    where: {
      customerId: customer.id,
      status: "OPEN",
      isActive: true,
      confirmedEstimateId: null,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!estimateRequest) {
    throw new Error(
      `채팅 테스트용 진행 중 견적요청을 찾을 수 없습니다: ${CHAT_TEST_CUSTOMER_EMAIL}`,
    );
  }

  const baseCreatedAt = addMinutes(new Date(), -CHAT_TEST_MESSAGE_COUNT);

  await prisma.$transaction(async (tx) => {
    const estimate = await tx.estimate.upsert({
      where: {
        estimateRequestId_moverId: {
          estimateRequestId: estimateRequest.id,
          moverId: mover.id,
        },
      },
      update: {
        status: "SENT",
        price: 230000,
        comment: "채팅 이전 메시지 로딩 상태 확인을 위한 테스트 견적입니다.",
        isDesignated: true,
        confirmedAt: null,
        expiredAt: null,
        canceledAt: null,
      },
      create: {
        estimateRequestId: estimateRequest.id,
        moverId: mover.id,
        status: "SENT",
        price: 230000,
        comment: "채팅 이전 메시지 로딩 상태 확인을 위한 테스트 견적입니다.",
        isDesignated: true,
      },
      select: { id: true },
    });

    const chatRoom = await tx.chatRoom.upsert({
      where: { estimateId: estimate.id },
      update: {
        estimateRequestId: estimateRequest.id,
        customerId: customer.id,
        moverId: mover.id,
      },
      create: {
        estimateRequestId: estimateRequest.id,
        estimateId: estimate.id,
        customerId: customer.id,
        moverId: mover.id,
      },
      select: { id: true },
    });

    await tx.chatMessage.deleteMany({
      where: { roomId: chatRoom.id },
    });

    const messages = Array.from({ length: CHAT_TEST_MESSAGE_COUNT }, (_, index) => {
      const isCustomer = index % 2 === 0;

      return {
        roomId: chatRoom.id,
        senderId: isCustomer ? customer.id : mover.id,
        type: "TEXT" as const,
        content: buildChatMessageContent(index, isCustomer),
        createdAt: addMinutes(baseCreatedAt, index),
      };
    });

    await tx.chatMessage.createMany({ data: messages });

    await tx.chatRoom.update({
      where: { id: chatRoom.id },
      data: {
        lastMessageAt: messages[messages.length - 1]?.createdAt ?? null,
      },
    });
  });

  console.log(
    `  • ${CHAT_TEST_CUSTOMER_EMAIL} ↔ ${CHAT_TEST_MOVER_EMAIL} 채팅 메시지 ${CHAT_TEST_MESSAGE_COUNT}건 생성 완료`,
  );
}
