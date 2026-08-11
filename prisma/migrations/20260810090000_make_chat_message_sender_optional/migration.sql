-- SYSTEM 메시지는 특정 사용자가 보낸 메시지가 아니므로 sender_id를 nullable로 변경합니다.
ALTER TABLE "public"."chat_messages" ALTER COLUMN "sender_id" DROP NOT NULL;
