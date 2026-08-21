import { NotificationType, type Prisma } from "@prisma/client";

import { AppError } from "../../../lib/app-error";
import { notificationService } from "../../notification/notification.service";
import { lockEstimateRequestForUpdate } from "../../../utils/estimate-request-lock.util";
import { runTransaction } from "../../../utils/transaction";
import { adminEstimatesRepository, type ConfirmedEstimateRow } from "./estimates.repository";
import type { CancelAdminEstimateBody, CancelAdminEstimateResponse } from "./estimates.type";

/** 확정 상태인 견적과 요청의 연결이 올바른지 확인합니다. */
function assertCancelableConfirmedTrade(
  estimate: ConfirmedEstimateRow | null,
): asserts estimate is ConfirmedEstimateRow {
  if (
    !estimate ||
    estimate.status !== "CONFIRMED" ||
    estimate.estimateRequest.status !== "CONFIRMED" ||
    !estimate.estimateRequest.isActive ||
    estimate.estimateRequest.confirmedEstimateId !== estimate.id
  ) {
    throw new AppError("ADMIN_ESTIMATE_CANCEL_NOT_ALLOWED");
  }
}

/** ActivityLog에 남길 관리자 조치 사유를 서비스 정책으로 조합합니다. */
function buildCancellationActivityMemo(input: CancelAdminEstimateBody): string {
  return input.internalNote
    ? `관리자 확정 거래 취소: ${input.reason}\n내부 메모: ${input.internalNote}`
    : `관리자 확정 거래 취소: ${input.reason}`;
}

async function cancelConfirmedTrade(
  estimate: ConfirmedEstimateRow,
  canceledAt: Date,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const canceledRequest = await adminEstimatesRepository.claimConfirmedEstimateRequestCancellation(
    estimate.estimateRequestId,
    estimate.id,
    canceledAt,
    tx,
  );
  const canceledEstimate = await adminEstimatesRepository.cancelConfirmedEstimate(
    estimate.id,
    canceledAt,
    tx,
  );

  if (canceledRequest.count === 0 || canceledEstimate.count === 0) {
    throw new AppError("ADMIN_ESTIMATE_CANCEL_NOT_ALLOWED");
  }
}

async function createCancellationSideEffects({
  estimate,
  adminId,
  input,
  canceledAt,
  tx,
}: {
  estimate: ConfirmedEstimateRow;
  adminId: string;
  input: CancelAdminEstimateBody;
  canceledAt: Date;
  tx: Prisma.TransactionClient;
}) {
  const notificationSourceId = `admin-estimate-cancel:${String(estimate.id)}`;
  const notifications: Prisma.NotificationCreateManyInput[] = [
    estimate.estimateRequest.customerId,
    estimate.moverId,
  ].map((userId) => ({
    userId,
    type: NotificationType.ESTIMATE_CANCELED_BY_ADMIN,
    title: "확정 견적 취소",
    content: "확정 견적 거래",
    linkUrl: null,
    expiresAt: null,
    sourceId: notificationSourceId,
  }));
  // 다른 기사의 채팅방에는 안내하지 않고, 취소된 확정 견적의 채팅방만 대상으로 합니다.
  const chatRoomIds = estimate.chatRoom ? [estimate.chatRoom.id] : [];
  const systemMessages: Prisma.ChatMessageCreateManyInput[] = chatRoomIds.map((roomId) => ({
    roomId,
    // SYSTEM 메시지는 고객·기사·관리자 중 누구의 발화도 아니므로 발신자를 두지 않습니다.
    senderId: null,
    type: "SYSTEM",
    content: "관리자 확인으로 확정된 견적 거래가 취소되었습니다.",
  }));

  await adminEstimatesRepository.cancelPendingRevisions(estimate.id, tx);
  await adminEstimatesRepository.createRequestCancellationHistory(
    {
      estimateRequestId: estimate.estimateRequestId,
      changedBy: adminId,
      type: "CANCELED",
      previousData: {
        status: estimate.estimateRequest.status,
        isActive: estimate.estimateRequest.isActive,
        confirmedEstimateId: estimate.estimateRequest.confirmedEstimateId,
      },
      changedData: {
        status: "CANCELED",
        isActive: false,
        canceledAt: canceledAt.toISOString(),
        cancelReason: "ADMIN_MANUAL_CANCELLATION",
      },
    },
    tx,
  );
  await adminEstimatesRepository.createSystemMessages(systemMessages, tx);
  await adminEstimatesRepository.updateChatRoomsLastMessageAt(chatRoomIds, canceledAt, tx);
  const createdNotifications = await adminEstimatesRepository.createNotifications(
    notifications,
    tx,
  );
  await adminEstimatesRepository.createActivityLog(
    { adminId, estimateId: estimate.id, memo: buildCancellationActivityMemo(input) },
    tx,
  );

  return createdNotifications;
}

export const adminEstimatesService = {
  async cancelConfirmedEstimate({
    estimateId,
    adminId,
    input,
  }: {
    estimateId: number;
    adminId: string;
    input: CancelAdminEstimateBody;
  }): Promise<CancelAdminEstimateResponse> {
    const { result, createdNotifications } = await runTransaction(async (tx) => {
      const initialEstimate = await adminEstimatesRepository.findForCancellation(estimateId, tx);

      if (!initialEstimate) {
        throw new AppError("ESTIMATE_NOT_FOUND");
      }

      const locked = await lockEstimateRequestForUpdate(tx, initialEstimate.estimateRequestId);

      if (!locked) {
        throw new AppError("ESTIMATE_NOT_FOUND");
      }

      // 다른 요청이 동시에 거래 상태를 바꾸지 못하도록 견적 요청을 잠근 뒤 최신 상태를 다시 확인
      const estimate = await adminEstimatesRepository.findForCancellation(estimateId, tx);

      assertCancelableConfirmedTrade(estimate);

      const canceledAt = new Date();
      await cancelConfirmedTrade(estimate, canceledAt, tx);
      const createdNotifications = await createCancellationSideEffects({
        estimate,
        adminId,
        input,
        canceledAt,
        tx,
      });

      return {
        result: {
          estimate: { id: estimate.id, status: "CANCELED", canceledAt },
          estimateRequest: {
            id: estimate.estimateRequestId,
            status: "CANCELED",
            canceledAt,
          },
        } satisfies CancelAdminEstimateResponse,
        createdNotifications,
      };
    });

    // 트랜잭션 커밋 후 실제 생성된 알림만 SSE로 전송합니다.
    for (const { userId, ...notification } of createdNotifications) {
      notificationService.sendNotification(userId, notification);
    }

    return result;
  },
};
