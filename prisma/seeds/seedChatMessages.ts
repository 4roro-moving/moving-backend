import type { PrismaClient } from "@prisma/client";

import { customerEmail } from "./customers.js";
import { moverEmail } from "./movers.js";

const CHAT_TEST_CUSTOMER_EMAIL = customerEmail(17);
const STALE_MOVER_EMAIL = moverEmail(17);
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

  const [customer, staleMover] = await Promise.all([
    prisma.user.findUnique({
      where: { email: CHAT_TEST_CUSTOMER_EMAIL },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { email: STALE_MOVER_EMAIL },
      select: { id: true },
    }),
  ]);

  if (!customer) {
    throw new Error(`채팅 테스트 고객 계정을 찾을 수 없습니다: ${CHAT_TEST_CUSTOMER_EMAIL}`);
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
    // 이전 시드에서 잘못 생성된 mover017 견적과 채팅방을 정리합니다.
    if (staleMover) {
      const staleEstimate = await tx.estimate.findUnique({
        where: {
          estimateRequestId_moverId: {
            estimateRequestId: estimateRequest.id,
            moverId: staleMover.id,
          },
        },
        select: { id: true },
      });

      if (staleEstimate) {
        await tx.estimateRevision.deleteMany({
          where: { estimateId: staleEstimate.id },
        });

        const staleRoom = await tx.chatRoom.findUnique({
          where: { estimateId: staleEstimate.id },
          select: { id: true },
        });

        if (staleRoom) {
          await tx.chatMessage.deleteMany({ where: { roomId: staleRoom.id } });
          await tx.chatRoom.delete({ where: { id: staleRoom.id } });
        }

        await tx.estimate.delete({ where: { id: staleEstimate.id } });
        console.log("  ✅ 이전 시드의 mover017 견적 및 채팅방 정리 완료");
      }
    }

    // customer017은 현재 SENT 견적이 여러 개이므로, 받은 견적 목록 정렬과 무관하게
    // 어떤 견적의 채팅방을 열어도 메시지 내역이 보이도록 모든 방에 메시지를 생성합니다.
    const estimates = await tx.estimate.findMany({
      where: {
        estimateRequestId: estimateRequest.id,
        status: "SENT",
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, moverId: true },
    });

    if (estimates.length === 0) {
      throw new Error(
        `채팅 테스트용 SENT 견적을 찾을 수 없습니다. scenarioSeeds 실행 여부를 확인하세요: ${CHAT_TEST_CUSTOMER_EMAIL}`,
      );
    }

    for (const [estimateIndex, estimate] of estimates.entries()) {
      const chatRoom = await tx.chatRoom.upsert({
        where: { estimateId: estimate.id },
        update: {
          estimateRequestId: estimateRequest.id,
          customerId: customer.id,
          moverId: estimate.moverId,
        },
        create: {
          estimateRequestId: estimateRequest.id,
          estimateId: estimate.id,
          customerId: customer.id,
          moverId: estimate.moverId,
        },
        select: { id: true },
      });

      await tx.chatMessage.deleteMany({
        where: { roomId: chatRoom.id },
      });

      const roomBaseCreatedAt = addMinutes(
        baseCreatedAt,
        -estimateIndex * (CHAT_TEST_MESSAGE_COUNT + 1),
      );
      const messages = Array.from({ length: CHAT_TEST_MESSAGE_COUNT }, (_, index) => {
        const isCustomer = index % 2 === 0;

        return {
          roomId: chatRoom.id,
          senderId: isCustomer ? customer.id : estimate.moverId,
          type: "TEXT" as const,
          content: buildChatMessageContent(index, isCustomer),
          createdAt: addMinutes(roomBaseCreatedAt, index),
        };
      });

      await tx.chatMessage.createMany({ data: messages });

      await tx.chatRoom.update({
        where: { id: chatRoom.id },
        data: {
          lastMessageAt: messages[messages.length - 1]?.createdAt ?? null,
        },
      });
    }
  });

  console.log(
    `  ✅ ${CHAT_TEST_CUSTOMER_EMAIL} 현재 SENT 견적별 채팅 메시지 ${CHAT_TEST_MESSAGE_COUNT}건 생성 완료`,
  );
}
