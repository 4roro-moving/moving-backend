export const CHAT_READ_VISIBILITY_DAYS = 3;
export const NOTIFICATION_RETENTION_DAYS = 90;
export const BULK_NOTIFICATION_BATCH_SIZE = 500;
export const HEARTBEAT_INTERVAL_MS = 30 * 1000;

export const SUPPORTED_NOTICE_AUDIENCES = ["CUSTOMER", "MOVER", "ALL"] as const;

export const NOTIFICATION_SSE_EVENTS = {
  CONNECTED: "connected",
  NOTIFICATION: "notification",
  REFRESH: "notification-refresh",
  ACCOUNT_SUSPENDED: "account-suspended",
} as const;
