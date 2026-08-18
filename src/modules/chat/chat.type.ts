import type { z } from "zod";

import type {
  chatMessageListQuerySchema,
  chatRoomParamSchema,
  createChatRoomBodySchema,
  joinChatRoomPayloadSchema,
  sendChatMessagePayloadSchema,
} from "./chat.validator";

export type ChatRoomParam = z.infer<typeof chatRoomParamSchema>;
export type CreateChatRoomBody = z.infer<typeof createChatRoomBodySchema>;
export type ChatMessageListQuery = z.infer<typeof chatMessageListQuerySchema>;
export type JoinChatRoomPayload = z.infer<typeof joinChatRoomPayloadSchema>;
export type SendChatMessagePayload = z.infer<typeof sendChatMessagePayloadSchema>;

export type ChatParticipant = {
  id: string;
  name: string;
  role: "CUSTOMER" | "MOVER";
};

export type ChatRoomSummary = {
  id: number;
  estimateId: number;
  estimateRequestId: number;
  customer: ChatParticipant;
  mover: ChatParticipant;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatMessageResponse = {
  id: number;
  roomId: number;
  // SYSTEM 메시지는 특정 사용자가 보낸 메시지가 아니므로 null입니다.
  senderId: string | null;
  type: "TEXT" | "IMAGE" | "SYSTEM" | "ESTIMATE_REVISION";
  content: string | null;
  imageUrl: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  sender: ChatParticipant | null;
};

export type MissedChatMessagesResponse = {
  messages: ChatMessageResponse[];
  hasMore: boolean;
  nextMessageId: number | null;
};
