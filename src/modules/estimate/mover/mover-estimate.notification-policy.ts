const REJECTION_NOTIFICATION_VISIBILITY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getRejectionNotificationExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + REJECTION_NOTIFICATION_VISIBILITY_DAYS * DAY_MS);
}
