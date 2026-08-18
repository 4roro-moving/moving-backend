import { Router } from "express";

import { authenticate } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { asyncHandler } from "../../utils/async-handler.util";
import { chatController } from "./chat.controller";
import {
  chatImageUploadUrlBodySchema,
  chatMessageListQuerySchema,
  chatRoomParamSchema,
  createChatRoomBodySchema,
} from "./chat.validator";

export const chatRouter = Router();

chatRouter.use(authenticate);

chatRouter.post(
  "/rooms",
  validate({ body: createChatRoomBodySchema }),
  asyncHandler(chatController.getOrCreateRoom),
);

chatRouter.get(
  "/rooms/:roomId",
  validate({ params: chatRoomParamSchema }),
  asyncHandler(chatController.getRoom),
);

chatRouter.get(
  "/rooms/:roomId/messages",
  validate({
    params: chatRoomParamSchema,
    query: chatMessageListQuerySchema,
  }),
  asyncHandler(chatController.getMessages),
);

chatRouter.post(
  "/rooms/:roomId/images/upload-url",
  validate({
    params: chatRoomParamSchema,
    body: chatImageUploadUrlBodySchema,
  }),
  asyncHandler(chatController.getImageUploadUrl),
);
