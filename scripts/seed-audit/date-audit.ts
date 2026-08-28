/* 모든 생성기의 날짜 순서를 전수 검사한다. */
import { resolveConfig } from "../../prisma/seeds/config.js";
import { generateUsers } from "../../prisma/seeds/generators/users.js";
import { generateEstimateFlow } from "../../prisma/seeds/generators/estimates.js";
import { generateTerms } from "../../prisma/seeds/generators/terms.js";
import { generateCommunity } from "../../prisma/seeds/generators/community.js";
import { generateNotifications } from "../../prisma/seeds/generators/notifications.js";
import { generateAdminContent } from "../../prisma/seeds/generators/admin.js";
import { REGIONS } from "../../prisma/seeds/generators/regions.js";

const config = resolveConfig();
const now = new Date();
const regions = REGIONS.map((r, i) => ({ id: i + 1, name: r.name }));

const ub = generateUsers(config, regions, "$2b$10$x", now);
const flow = generateEstimateFlow(
  config,
  regions,
  ub.customers,
  ub.movers,
  ub.rows.moverUnavailableDates as { moverId: string; date: Date }[],
  now,
);
const terms = generateTerms(ub.admins, [...ub.customers, ...ub.movers], now);
const comm = generateCommunity(config, regions, ub.customers, ub.movers, now);
const notif = generateNotifications(ub.customers, ub.movers, now);
const admin = generateAdminContent(
  config,
  ub.admins,
  ub.customers,
  ub.movers,
  {
    reviews: (flow.rows.reviews as { id: number; createdAt: Date }[]).map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
    })),
    hiddenReviews: (flow.rows.reviews as { id: number; isHidden: boolean; createdAt: Date }[])
      .filter((r) => r.isHidden)
      .map((r) => ({ id: r.id, createdAt: r.createdAt })),
    residenceReviews: (comm.rows.residenceReviews as { id: number; createdAt: Date }[]).map(
      (r) => ({ id: r.id, createdAt: r.createdAt }),
    ),
    giveaways: (comm.rows.giveaways as { id: number; createdAt: Date }[]).map((g) => ({
      id: g.id,
      createdAt: g.createdAt,
    })),
    lastActivityByUser: flow.lastActivityByUser,
  },
  now,
);

const userById = new Map([...ub.customers, ...ub.movers, ...ub.admins].map((u) => [u.id, u]));
let fail = 0;
const T = now.getTime();
const ck = (name: string, bad: number, sample?: string) => {
  if (bad === 0) {
    console.log(`  OK   ${name}`);
    return;
  }
  console.log(`  FAIL ${name}: ${bad}${sample ? `  e.g. ${sample}` : ""}`);
  fail += 1;
};
const g = <T>(a: readonly unknown[]) => a as T[];

console.log("\n[1] 미래 날짜 누출 (now 초과)");
ck(
  "user.createdAt <= now",
  g<{ createdAt: Date }>(ub.rows.users).filter((u) => u.createdAt.getTime() > T).length,
);
ck(
  "customerProfile.createdAt <= now",
  g<{ createdAt: Date }>(ub.rows.customerProfiles).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "moverProfile.createdAt <= now",
  g<{ createdAt: Date }>(ub.rows.moverProfiles).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "request.createdAt <= now",
  g<{ createdAt: Date }>(flow.rows.estimateRequests).filter((x) => x.createdAt.getTime() > T)
    .length,
);
ck(
  "estimate.createdAt <= now",
  g<{ createdAt: Date }>(flow.rows.estimates).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "review.createdAt <= now",
  g<{ createdAt: Date }>(flow.rows.reviews).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "chatMessage.createdAt <= now",
  g<{ createdAt: Date }>(flow.rows.chatMessages).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "chatRoom.createdAt <= now",
  g<{ createdAt: Date }>(flow.rows.chatRooms).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "history.createdAt <= now",
  g<{ createdAt: Date }>(flow.rows.estimateRequestHistories).filter(
    (x) => x.createdAt.getTime() > T,
  ).length,
);
ck(
  "rejection.createdAt <= now",
  g<{ createdAt: Date }>(flow.rows.estimateRequestRejections).filter(
    (x) => x.createdAt.getTime() > T,
  ).length,
);
ck(
  "designated.createdAt <= now",
  g<{ createdAt: Date }>(flow.rows.designatedMovers).filter((x) => x.createdAt.getTime() > T)
    .length,
);
ck(
  "favorite.createdAt <= now",
  g<{ createdAt: Date }>(comm.rows.favoriteMovers).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "residenceReview.createdAt <= now",
  g<{ createdAt: Date }>(comm.rows.residenceReviews).filter((x) => x.createdAt.getTime() > T)
    .length,
);
ck(
  "giveaway.createdAt <= now",
  g<{ createdAt: Date }>(comm.rows.giveaways).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "giveawayRequest.createdAt <= now",
  g<{ createdAt: Date }>(comm.rows.giveawayRequests).filter((x) => x.createdAt.getTime() > T)
    .length,
);
ck(
  "notification.createdAt <= now",
  g<{ createdAt: Date }>(notif).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "termsAgreement.agreedAt <= now",
  g<{ agreedAt: Date }>(terms.rows.termsAgreements).filter((x) => x.agreedAt.getTime() > T).length,
);
ck(
  "terms.publishedAt <= now",
  g<{ publishedAt: Date | null }>(terms.rows.terms).filter(
    (x) => x.publishedAt && x.publishedAt.getTime() > T,
  ).length,
);
ck(
  "inquiry.createdAt <= now",
  g<{ createdAt: Date }>(admin.rows.inquiries).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "inquiry.closedAt <= now",
  g<{ closedAt: Date | null }>(admin.rows.inquiries).filter(
    (x) => x.closedAt && x.closedAt.getTime() > T,
  ).length,
);
ck(
  "inquiryMessage.createdAt <= now",
  g<{ createdAt: Date }>(admin.rows.inquiryMessages).filter((x) => x.createdAt.getTime() > T)
    .length,
);
ck(
  "report.createdAt <= now",
  g<{ createdAt: Date }>(admin.rows.reports).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "report.handledAt <= now",
  g<{ handledAt: Date | null }>(admin.rows.reports).filter(
    (x) => x.handledAt && x.handledAt.getTime() > T,
  ).length,
);
ck(
  "suspension.createdAt <= now",
  g<{ createdAt: Date }>(admin.rows.userSuspensions).filter((x) => x.createdAt.getTime() > T)
    .length,
);
ck(
  "activityLog.createdAt <= now",
  g<{ createdAt: Date }>(admin.rows.activityLogs).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "notice.createdAt <= now",
  g<{ createdAt: Date }>(admin.rows.notices).filter((x) => x.createdAt.getTime() > T).length,
);
ck(
  "faq.createdAt <= now",
  g<{ createdAt: Date }>(admin.rows.faqs).filter((x) => x.createdAt.getTime() > T).length,
);

console.log("\n[2] 작성자 가입일보다 이른 활동 (계정 없는데 활동함)");
const beforeJoin = <T extends { createdAt: Date }>(
  rows: T[],
  uid: (row: T) => string,
  label: string,
): void => {
  let bad = 0;
  let sample = "";
  for (const r of rows) {
    const u = userById.get(uid(r));
    if (u && r.createdAt.getTime() < u.createdAt.getTime()) {
      bad += 1;
      if (!sample)
        sample = `가입 ${u.createdAt.toISOString().slice(0, 10)} vs 활동 ${r.createdAt.toISOString().slice(0, 10)}`;
    }
  }
  ck(label, bad, sample);
};
beforeJoin(
  g<{ createdAt: Date; customerId: string }>(flow.rows.estimateRequests),
  (r) => r.customerId,
  "request >= customer.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; moverId: string }>(flow.rows.estimates),
  (r) => r.moverId,
  "estimate >= mover.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; customerId: string }>(flow.rows.reviews),
  (r) => r.customerId,
  "review >= customer.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; moverId: string }>(flow.rows.estimateRequestRejections),
  (r) => r.moverId,
  "rejection >= mover.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; senderId: string }>(flow.rows.chatMessages),
  (r) => r.senderId,
  "chatMessage >= sender.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; customerId: string }>(comm.rows.favoriteMovers),
  (r) => r.customerId,
  "favorite >= customer.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; moverId: string }>(comm.rows.favoriteMovers),
  (r) => r.moverId,
  "favorite >= mover.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; authorId: string }>(comm.rows.residenceReviews),
  (r) => r.authorId,
  "residenceReview >= author.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; authorId: string }>(comm.rows.giveaways),
  (r) => r.authorId,
  "giveaway >= author.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; requesterId: string }>(comm.rows.giveawayRequests),
  (r) => r.requesterId,
  "giveawayRequest >= requester.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; authorId: string }>(admin.rows.inquiries),
  (r) => r.authorId,
  "inquiry >= author.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; reporterId: string }>(admin.rows.reports),
  (r) => r.reporterId,
  "report >= reporter.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; userId: string }>(admin.rows.userSuspensions),
  (r) => r.userId,
  "suspension >= user.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; adminId: string }>(admin.rows.userSuspensions),
  (r) => r.adminId,
  "suspension >= admin.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; actorId: string }>(admin.rows.activityLogs),
  (r) => r.actorId,
  "activityLog >= actor.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; authorId: string }>(admin.rows.notices),
  (r) => r.authorId,
  "notice >= admin.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; authorId: string }>(admin.rows.faqs),
  (r) => r.authorId,
  "faq >= admin.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; authorId: string }>(terms.rows.terms),
  (r) => r.authorId,
  "terms >= admin.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; userId: string }>(notif),
  (r) => r.userId,
  "notification >= user.createdAt",
);
beforeJoin(
  g<{ createdAt: Date; senderId: string }>(admin.rows.inquiryMessages),
  (r) => r.senderId,
  "inquiryMessage >= sender.createdAt",
);

console.log("\n[3] 레코드 내부 순서");
ck(
  "report.handledAt >= createdAt",
  g<{ createdAt: Date; handledAt: Date | null }>(admin.rows.reports).filter(
    (r) => r.handledAt && r.handledAt.getTime() < r.createdAt.getTime(),
  ).length,
);
ck(
  "inquiry.closedAt >= lastMessageAt",
  g<{ closedAt: Date | null; lastMessageAt: Date }>(admin.rows.inquiries).filter(
    (i) => i.closedAt && i.closedAt.getTime() < i.lastMessageAt.getTime(),
  ).length,
);
ck(
  "inquiry.lastMessageAt >= createdAt",
  g<{ createdAt: Date; lastMessageAt: Date }>(admin.rows.inquiries).filter(
    (i) => i.lastMessageAt.getTime() < i.createdAt.getTime(),
  ).length,
);
ck(
  "giveaway.updatedAt >= createdAt",
  g<{ createdAt: Date; updatedAt: Date }>(comm.rows.giveaways).filter(
    (x) => x.updatedAt.getTime() < x.createdAt.getTime(),
  ).length,
);
ck(
  "request.updatedAt >= createdAt",
  g<{ createdAt: Date; updatedAt: Date }>(flow.rows.estimateRequests).filter(
    (x) => x.updatedAt.getTime() < x.createdAt.getTime(),
  ).length,
);
ck(
  "estimate.updatedAt >= createdAt",
  g<{ createdAt: Date; updatedAt: Date }>(flow.rows.estimates).filter(
    (x) => x.updatedAt.getTime() < x.createdAt.getTime(),
  ).length,
);
ck(
  "chatRoom.updatedAt >= createdAt",
  g<{ createdAt: Date; updatedAt: Date }>(flow.rows.chatRooms).filter(
    (x) => x.updatedAt.getTime() < x.createdAt.getTime(),
  ).length,
);
ck(
  "notification.readAt >= createdAt",
  g<{ createdAt: Date; readAt: Date | null }>(notif).filter(
    (n) => n.readAt && n.readAt.getTime() < n.createdAt.getTime(),
  ).length,
);
ck(
  "notification.readAt <= now",
  g<{ readAt: Date | null }>(notif).filter((n) => n.readAt && n.readAt.getTime() > T).length,
);
ck(
  "chatMessage.readAt >= createdAt",
  g<{ createdAt: Date; readAt: Date | null }>(flow.rows.chatMessages).filter(
    (m) => m.readAt && m.readAt.getTime() < m.createdAt.getTime(),
  ).length,
);
ck(
  "chatMessage.readAt <= now",
  g<{ readAt: Date | null }>(flow.rows.chatMessages).filter(
    (m) => m.readAt && m.readAt.getTime() > T,
  ).length,
);
ck(
  "request.canceledAt >= createdAt",
  g<{ createdAt: Date; canceledAt: Date | null }>(flow.rows.estimateRequests).filter(
    (r) => r.canceledAt && r.canceledAt.getTime() < r.createdAt.getTime(),
  ).length,
);
ck(
  "request.completedAt >= createdAt",
  g<{ createdAt: Date; completedAt: Date | null }>(flow.rows.estimateRequests).filter(
    (r) => r.completedAt && r.completedAt.getTime() < r.createdAt.getTime(),
  ).length,
);
ck(
  "request.completedAt <= now",
  g<{ completedAt: Date | null }>(flow.rows.estimateRequests).filter(
    (r) => r.completedAt && r.completedAt.getTime() > T,
  ).length,
);
ck(
  "request.canceledAt <= now",
  g<{ canceledAt: Date | null }>(flow.rows.estimateRequests).filter(
    (r) => r.canceledAt && r.canceledAt.getTime() > T,
  ).length,
);

console.log("\n[4] 관계 간 순서");
const roomById = new Map(
  g<{ id: number; createdAt: Date }>(flow.rows.chatRooms).map((r) => [r.id, r]),
);
ck(
  "chatMessage >= room.createdAt",
  g<{ roomId: number; createdAt: Date }>(flow.rows.chatMessages).filter((m) => {
    const r = roomById.get(m.roomId);
    return r && m.createdAt.getTime() < r.createdAt.getTime();
  }).length,
);
const gwById = new Map(
  g<{ id: number; createdAt: Date }>(comm.rows.giveaways).map((x) => [x.id, x]),
);
ck(
  "giveawayRequest >= giveaway.createdAt",
  g<{ giveawayId: number; createdAt: Date }>(comm.rows.giveawayRequests).filter((r) => {
    const x = gwById.get(r.giveawayId);
    return x && r.createdAt.getTime() < x.createdAt.getTime();
  }).length,
);
const inqById = new Map(
  g<{ id: number; createdAt: Date }>(admin.rows.inquiries).map((x) => [x.id, x]),
);
ck(
  "inquiryMessage >= inquiry.createdAt",
  g<{ inquiryId: number; createdAt: Date }>(admin.rows.inquiryMessages).filter((m) => {
    const x = inqById.get(m.inquiryId);
    return x && m.createdAt.getTime() < x.createdAt.getTime();
  }).length,
);
const reqById = new Map(
  g<{ id: number; createdAt: Date }>(flow.rows.estimateRequests).map((r) => [r.id, r]),
);
ck(
  "history >= request.createdAt",
  g<{ estimateRequestId: number; createdAt: Date }>(flow.rows.estimateRequestHistories).filter(
    (h) => {
      const r = reqById.get(h.estimateRequestId);
      return r && h.createdAt.getTime() < r.createdAt.getTime();
    },
  ).length,
);
ck(
  "rejection >= request.createdAt",
  g<{ estimateRequestId: number; createdAt: Date }>(flow.rows.estimateRequestRejections).filter(
    (h) => {
      const r = reqById.get(h.estimateRequestId);
      return r && h.createdAt.getTime() < r.createdAt.getTime();
    },
  ).length,
);
const termsById = new Map(
  g<{ id: number; publishedAt: Date | null }>(terms.rows.terms).map((t) => [t.id, t]),
);
ck(
  "agreement >= terms.publishedAt",
  g<{ termsId: number; agreedAt: Date }>(terms.rows.termsAgreements).filter((a) => {
    const t = termsById.get(a.termsId);
    return t && t.publishedAt && a.agreedAt.getTime() < t.publishedAt.getTime();
  }).length,
);

console.log("\n[5] 신고 대상 존재 시점");
const reviewCreated = new Map(
  g<{ id: number; createdAt: Date }>(flow.rows.reviews).map((r) => [String(r.id), r.createdAt]),
);
const rrCreated = new Map(
  g<{ id: number; createdAt: Date }>(comm.rows.residenceReviews).map((r) => [
    String(r.id),
    r.createdAt,
  ]),
);
const gwCreated = new Map(
  g<{ id: number; createdAt: Date }>(comm.rows.giveaways).map((r) => [String(r.id), r.createdAt]),
);
let badTarget = 0;
let sampleT = "";
for (const r of g<{ targetType: string; targetId: string; createdAt: Date }>(admin.rows.reports)) {
  const m =
    r.targetType === "REVIEW"
      ? reviewCreated
      : r.targetType === "RESIDENCE_REVIEW"
        ? rrCreated
        : r.targetType === "GIVEAWAY"
          ? gwCreated
          : null;
  if (!m) continue;
  const c = m.get(r.targetId);
  if (c && r.createdAt.getTime() < c.getTime()) {
    badTarget++;
    if (!sampleT)
      sampleT = `대상생성 ${c.toISOString().slice(0, 10)} vs 신고 ${r.createdAt.toISOString().slice(0, 10)}`;
  }
}
ck("report >= target.createdAt", badTarget, sampleT);

let badHide = 0;
let sampleH = "";
const hideLogs = g<{
  action: string;
  targetType: string;
  targetId: string;
  createdAt: Date;
}>(admin.rows.activityLogs).filter((l) => l.action === "HIDE" && l.targetType === "REVIEW");
for (const l of hideLogs) {
  const c = reviewCreated.get(l.targetId);
  if (c && l.createdAt.getTime() < c.getTime()) {
    badHide++;
    if (!sampleH)
      sampleH = `리뷰생성 ${c.toISOString().slice(0, 10)} vs 숨김 ${l.createdAt.toISOString().slice(0, 10)}`;
  }
}
ck("HIDE log >= review.createdAt", badHide, sampleH);

console.log("\n[6] 정지 이력 순서");
const bySusp = new Map<string, { action: string; createdAt: Date }[]>();
for (const s of g<{ userId: string; action: string; createdAt: Date }>(
  admin.rows.userSuspensions,
)) {
  const l = bySusp.get(s.userId) ?? [];
  l.push(s);
  bySusp.set(s.userId, l);
}
let badRel = 0;
for (const [, list] of bySusp) {
  const sus = list.find((x) => x.action === "SUSPEND");
  const rel = list.find((x) => x.action === "RELEASE");
  if (sus && rel && rel.createdAt.getTime() <= sus.createdAt.getTime()) badRel++;
}
ck("RELEASE > SUSPEND", badRel);

console.log(fail === 0 ? "\n=== 날짜 충돌 없음 ===" : `\n=== ${fail}개 항목에서 날짜 충돌 ===`);
