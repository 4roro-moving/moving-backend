/* 1차 감사에서 빠진 영역을 검사한다. */
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
const T = now.getTime();
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
const rvAll = flow.rows.reviews as { id: number; isHidden: boolean; createdAt: Date }[];
const admin = generateAdminContent(
  config,
  ub.admins,
  ub.customers,
  ub.movers,
  {
    reviews: rvAll.map((r) => ({ id: r.id, createdAt: r.createdAt })),
    hiddenReviews: rvAll
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

let fail = 0;
const ck = (n: string, bad: number, s?: string) => {
  if (bad === 0) {
    console.log(`  OK   ${n}`);
    return;
  }
  console.log(`  FAIL ${n}: ${bad}${s ? `  e.g. ${s}` : ""}`);
  fail += 1;
};
const G = <T>(a: readonly unknown[]) => a as T[];
const d = (x: Date) => x.toISOString().slice(0, 16);

type Req = {
  id: number;
  status: string;
  isActive: boolean;
  moveDate: Date;
  expiresAt: Date;
  expiredAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  canceledAt: Date | null;
  customerId: string;
};
type Est = {
  id: number;
  estimateRequestId: number;
  moverId: string;
  status: string;
  createdAt: Date;
  confirmedAt: Date | null;
  expiredAt: Date | null;
  canceledAt: Date | null;
};
const reqs = G<Req>(flow.rows.estimateRequests);
const ests = G<Est>(flow.rows.estimates);
const reqById = new Map(reqs.map((r) => [r.id, r]));
const estById = new Map(ests.map((e) => [e.id, e]));

console.log("\n[A] 상태 ↔ 시각 일관성 (상태가 시간과 모순되지 않는가)");
ck(
  "OPEN 요청은 아직 만료 전",
  reqs.filter((r) => r.status === "OPEN" && r.expiresAt.getTime() <= T).length,
  (() => {
    const x = reqs.find((r) => r.status === "OPEN" && r.expiresAt.getTime() <= T);
    return x ? `만료 ${d(x.expiresAt)} < 지금` : "";
  })(),
);
ck(
  "OPEN 요청 이사일은 미래",
  reqs.filter((r) => r.status === "OPEN" && r.moveDate.getTime() <= T).length,
);
ck(
  "CONFIRMED 요청 이사일은 미래",
  reqs.filter((r) => r.status === "CONFIRMED" && r.moveDate.getTime() <= T).length,
);
ck(
  "COMPLETED 요청 이사일은 과거",
  reqs.filter((r) => r.status === "COMPLETED" && r.moveDate.getTime() > T).length,
);
ck(
  "EXPIRED 요청 이사일은 과거",
  reqs.filter((r) => r.status === "EXPIRED" && r.moveDate.getTime() > T).length,
);
ck(
  "EXPIRED 요청은 expiredAt 보유",
  reqs.filter((r) => r.status === "EXPIRED" && r.expiredAt === null).length,
);
ck(
  "EXPIRED 아닌데 expiredAt 있음",
  reqs.filter((r) => r.status !== "EXPIRED" && r.expiredAt !== null).length,
);
ck("expiredAt 은 과거", reqs.filter((r) => r.expiredAt && r.expiredAt.getTime() > T).length);
ck(
  "CANCELED 요청은 canceledAt 보유",
  reqs.filter((r) => r.status === "CANCELED" && r.canceledAt === null).length,
);
ck(
  "CANCELED 아닌데 canceledAt 있음",
  reqs.filter((r) => r.status !== "CANCELED" && r.canceledAt !== null).length,
);
ck(
  "COMPLETED 요청은 completedAt 보유",
  reqs.filter((r) => r.status === "COMPLETED" && r.completedAt === null).length,
);
ck(
  "COMPLETED 아닌데 completedAt 있음",
  reqs.filter((r) => r.status !== "COMPLETED" && r.completedAt !== null).length,
);
ck(
  "completedAt >= moveDate",
  reqs.filter((r) => r.completedAt && r.completedAt.getTime() < r.moveDate.getTime()).length,
);
ck(
  "canceledAt <= moveDate",
  reqs.filter((r) => r.canceledAt && r.canceledAt.getTime() > r.moveDate.getTime() + 86400000)
    .length,
);
ck("PENDING 요청은 isActive", reqs.filter((r) => r.status === "PENDING" && !r.isActive).length);
ck(
  "과거 상태는 isActive=false",
  reqs.filter(
    (r) => ["COMPLETED", "EXPIRED", "CANCELED", "CONFIRMED"].includes(r.status) && r.isActive,
  ).length,
);

console.log("\n[B] 견적 상태 ↔ 시각");
ck(
  "CONFIRMED 견적은 confirmedAt 보유",
  ests.filter((e) => e.status === "CONFIRMED" && e.confirmedAt === null).length,
);
ck(
  "CONFIRMED 아닌데 confirmedAt 있음",
  ests.filter((e) => e.status !== "CONFIRMED" && e.confirmedAt !== null).length,
);
ck("confirmedAt 은 과거", ests.filter((e) => e.confirmedAt && e.confirmedAt.getTime() > T).length);
ck(
  "EXPIRED 견적은 expiredAt 보유",
  ests.filter((e) => e.status === "EXPIRED" && e.expiredAt === null).length,
);
ck(
  "CANCELED 견적은 canceledAt 보유",
  ests.filter((e) => e.status === "CANCELED" && e.canceledAt === null).length,
);
ck(
  "SENT 견적은 진행중 요청 소속",
  ests.filter((e) => {
    const r = reqById.get(e.estimateRequestId);
    return e.status === "SENT" && r && !["OPEN"].includes(r.status);
  }).length,
);
ck(
  "견적 만료시각 = 요청 만료시각",
  ests.filter((e) => {
    const r = reqById.get(e.estimateRequestId);
    return e.expiredAt && r && Math.abs(e.expiredAt.getTime() - r.expiresAt.getTime()) > 1000;
  }).length,
);

console.log("\n[C] 프로필/부속 테이블 시각");
const uById = new Map(G<{ id: string; createdAt: Date }>(ub.rows.users).map((u) => [u.id, u]));
ck(
  "customerProfile = user.createdAt",
  G<{ userId: string; createdAt: Date }>(ub.rows.customerProfiles).filter((p) => {
    const u = uById.get(p.userId);
    return u && p.createdAt.getTime() < u.createdAt.getTime();
  }).length,
);
ck(
  "moverProfile = user.createdAt",
  G<{ userId: string; createdAt: Date }>(ub.rows.moverProfiles).filter((p) => {
    const u = uById.get(p.userId);
    return u && p.createdAt.getTime() < u.createdAt.getTime();
  }).length,
);
const cpById = new Map(
  G<{ id: number; createdAt: Date }>(ub.rows.customerProfiles).map((p) => [p.id, p]),
);
const mpById = new Map(
  G<{ id: number; createdAt: Date }>(ub.rows.moverProfiles).map((p) => [p.id, p]),
);
ck(
  "customerServiceArea >= profile",
  G<{ customerProfileId: number; createdAt: Date }>(ub.rows.customerServiceAreas).filter((a) => {
    const p = cpById.get(a.customerProfileId);
    return p && a.createdAt.getTime() < p.createdAt.getTime();
  }).length,
);
ck(
  "moverServiceArea >= profile",
  G<{ moverProfileId: number; createdAt: Date }>(ub.rows.moverServiceAreas).filter((a) => {
    const p = mpById.get(a.moverProfileId);
    return p && a.createdAt.getTime() < p.createdAt.getTime();
  }).length,
);
ck(
  "moverServiceType >= profile",
  G<{ moverProfileId: number; createdAt: Date }>(ub.rows.moverServiceTypes).filter((a) => {
    const p = mpById.get(a.moverProfileId);
    return p && a.createdAt.getTime() < p.createdAt.getTime();
  }).length,
);
ck(
  "휴무일은 미래만",
  G<{ date: Date }>(ub.rows.moverUnavailableDates).filter((x) => x.date.getTime() < T - 86400000)
    .length,
  (() => {
    const x = G<{ date: Date }>(ub.rows.moverUnavailableDates).find(
      (y) => y.date.getTime() < T - 86400000,
    );
    return x ? d(x.date) : "";
  })(),
);
ck(
  "휴무일 >= 기사 가입",
  G<{ moverId: string; date: Date }>(ub.rows.moverUnavailableDates).filter((x) => {
    const u = uById.get(x.moverId);
    return u && x.date.getTime() < u.createdAt.getTime();
  }).length,
);

console.log("\n[D] 약관 버전 순서");
type Tm = {
  id: number;
  type: string;
  status: string;
  version: string;
  publishedAt: Date | null;
  effectiveAt: Date | null;
  createdAt: Date;
};
const tms = G<Tm>(terms.rows.terms);
ck(
  "DRAFT 은 publishedAt null",
  tms.filter((t) => t.status === "DRAFT" && t.publishedAt !== null).length,
);
ck(
  "PUBLISHED/ARCHIVED 는 publishedAt 보유",
  tms.filter((t) => t.status !== "DRAFT" && t.publishedAt === null).length,
);
ck(
  "effectiveAt = publishedAt",
  tms.filter(
    (t) =>
      t.publishedAt &&
      t.effectiveAt &&
      Math.abs(t.effectiveAt.getTime() - t.publishedAt.getTime()) > 1000,
  ).length,
);
let badVer = 0;
let sv = "";
for (const t of tms) {
  if (t.status !== "PUBLISHED") continue;
  const archived = tms.filter((x) => x.type === t.type && x.status === "ARCHIVED");
  for (const a of archived) {
    if (a.publishedAt && t.publishedAt && a.publishedAt.getTime() >= t.publishedAt.getTime()) {
      badVer++;
      if (!sv) sv = `${t.type} ARCHIVED ${d(a.publishedAt)} >= PUBLISHED ${d(t.publishedAt)}`;
    }
  }
}
ck("ARCHIVED 가 PUBLISHED 보다 앞섬", badVer, sv);
ck(
  "createdAt = publishedAt (게시본)",
  tms.filter((t) => t.publishedAt && t.createdAt.getTime() > t.publishedAt.getTime()).length,
);

console.log("\n[E] updatedAt / 부속 레코드");
ck(
  "review.updatedAt >= createdAt",
  G<{ createdAt: Date; updatedAt: Date }>(flow.rows.reviews).filter(
    (r) => r.updatedAt.getTime() < r.createdAt.getTime(),
  ).length,
);
ck(
  "residenceReview.updatedAt >= createdAt",
  G<{ createdAt: Date; updatedAt: Date }>(comm.rows.residenceReviews).filter(
    (r) => r.updatedAt.getTime() < r.createdAt.getTime(),
  ).length,
);
ck(
  "giveawayRequest.updatedAt >= createdAt",
  G<{ createdAt: Date; updatedAt: Date }>(comm.rows.giveawayRequests).filter(
    (r) => r.updatedAt.getTime() < r.createdAt.getTime(),
  ).length,
);
ck(
  "customerProfile.updatedAt >= createdAt",
  G<{ createdAt: Date; updatedAt: Date }>(ub.rows.customerProfiles).filter(
    (r) => r.updatedAt.getTime() < r.createdAt.getTime(),
  ).length,
);
ck(
  "moverProfile.updatedAt >= createdAt",
  G<{ createdAt: Date; updatedAt: Date }>(ub.rows.moverProfiles).filter(
    (r) => r.updatedAt.getTime() < r.createdAt.getTime(),
  ).length,
);
ck(
  "terms.updatedAt >= createdAt",
  G<{ createdAt: Date; updatedAt: Date }>(terms.rows.terms).filter(
    (r) => r.updatedAt.getTime() < r.createdAt.getTime(),
  ).length,
);
ck(
  "notice.updatedAt >= createdAt",
  G<{ createdAt: Date; updatedAt: Date }>(admin.rows.notices).filter(
    (r) => r.updatedAt.getTime() < r.createdAt.getTime(),
  ).length,
);
ck(
  "report.updatedAt >= createdAt",
  G<{ createdAt: Date; updatedAt: Date }>(admin.rows.reports).filter(
    (r) => r.updatedAt.getTime() < r.createdAt.getTime(),
  ).length,
);
ck(
  "inquiry.updatedAt >= createdAt",
  G<{ createdAt: Date; updatedAt: Date }>(admin.rows.inquiries).filter(
    (r) => r.updatedAt.getTime() < r.createdAt.getTime(),
  ).length,
);
const gwById2 = new Map(
  G<{ id: number; createdAt: Date }>(comm.rows.giveaways).map((g) => [g.id, g]),
);
ck(
  "giveawayImage >= giveaway.createdAt",
  G<{ giveawayId: number; createdAt: Date }>(comm.rows.giveawayImages).filter((i) => {
    const g = gwById2.get(i.giveawayId);
    return g && i.createdAt.getTime() < g.createdAt.getTime();
  }).length,
);
ck(
  "giveawayImage.updatedAt >= createdAt",
  G<{ createdAt: Date; updatedAt: Date }>(comm.rows.giveawayImages).filter(
    (r) => r.updatedAt.getTime() < r.createdAt.getTime(),
  ).length,
);
ck(
  "designated >= request.createdAt",
  G<{ estimateRequestId: number; createdAt: Date }>(flow.rows.designatedMovers).filter((x) => {
    const r = reqById.get(x.estimateRequestId);
    return r && x.createdAt.getTime() < r.createdAt.getTime();
  }).length,
);
ck(
  "designated <= now",
  G<{ createdAt: Date }>(flow.rows.designatedMovers).filter((x) => x.createdAt.getTime() > T)
    .length,
);

console.log("\n[F] 견적↔리뷰↔채팅 연쇄");
ck(
  "review >= estimate.confirmedAt",
  G<{ estimateId: number; createdAt: Date }>(flow.rows.reviews).filter((v) => {
    const e = estById.get(v.estimateId);
    return e?.confirmedAt && v.createdAt.getTime() < e.confirmedAt.getTime();
  }).length,
);
ck(
  "review >= request.completedAt",
  G<{ estimateId: number; createdAt: Date }>(flow.rows.reviews).filter((v) => {
    const e = estById.get(v.estimateId);
    const r = e && reqById.get(e.estimateRequestId);
    return r?.completedAt && v.createdAt.getTime() < r.completedAt.getTime();
  }).length,
);
ck(
  "chatRoom >= estimate.confirmedAt",
  G<{ estimateId: number; createdAt: Date }>(flow.rows.chatRooms).filter((c) => {
    const e = estById.get(c.estimateId);
    return e?.confirmedAt && c.createdAt.getTime() < e.confirmedAt.getTime();
  }).length,
);
ck(
  "history CANCELED = request.canceledAt",
  G<{ estimateRequestId: number; type: string; createdAt: Date }>(
    flow.rows.estimateRequestHistories,
  ).filter((h) => {
    if (h.type !== "CANCELED") return false;
    const r = reqById.get(h.estimateRequestId);
    return r?.canceledAt && Math.abs(h.createdAt.getTime() - r.canceledAt.getTime()) > 1000;
  }).length,
);
ck(
  "history <= request 종료시각",
  G<{ estimateRequestId: number; createdAt: Date }>(flow.rows.estimateRequestHistories).filter(
    (h) => h.createdAt.getTime() > T,
  ).length,
);

console.log("\n[G] 알림 만료");
ck(
  "notification.expiresAt > createdAt (미만료건)",
  G<{ createdAt: Date; expiresAt: Date }>(notif).filter(
    (n) => n.expiresAt.getTime() > T && n.expiresAt.getTime() < n.createdAt.getTime(),
  ).length,
);
ck(
  "만료된 알림은 createdAt 도 과거",
  G<{ createdAt: Date; expiresAt: Date }>(notif).filter(
    (n) => n.expiresAt.getTime() <= T && n.createdAt.getTime() > T,
  ).length,
);

console.log("\n[H] 문의 상태 ↔ 시각");
ck(
  "OPEN 문의는 closedAt 없음",
  G<{ status: string; closedAt: Date | null }>(admin.rows.inquiries).filter(
    (i) => i.status !== "CLOSED" && i.closedAt !== null,
  ).length,
);
ck(
  "CLOSED 문의는 closedAt 보유",
  G<{ status: string; closedAt: Date | null }>(admin.rows.inquiries).filter(
    (i) => i.status === "CLOSED" && i.closedAt === null,
  ).length,
);
ck(
  "OPEN 문의는 handledBy 없음",
  G<{ status: string; handledBy: string | null }>(admin.rows.inquiries).filter(
    (i) => i.status === "OPEN" && i.handledBy !== null,
  ).length,
);

console.log(fail === 0 ? "\n=== 2차 감사: 이상 없음 ===" : `\n=== 2차 감사: ${fail}개 이상 ===`);
