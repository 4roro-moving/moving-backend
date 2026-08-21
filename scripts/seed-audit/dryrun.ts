/* 생성기를 DB 없이 실행해 불변식을 검사한다. */
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

console.log(`preset=${config.name}`);
const ub = generateUsers(config, regions, "$2b$10$fakehash", now);
console.log(
  `users=${(ub.rows.users as unknown[]).length} customers=${ub.customers.length} movers=${ub.movers.length}`,
);

const flow = generateEstimateFlow(
  config,
  regions,
  ub.customers,
  ub.movers,
  ub.rows.moverUnavailableDates as { moverId: string; date: Date }[],
  now,
);
console.log(
  `requests=${flow.stats.requests} estimates=${flow.stats.estimates} reviews=${flow.stats.reviews} rooms=${flow.stats.chatRooms} msgs=${flow.stats.chatMessages}`,
);

const terms = generateTerms(ub.admins, [...ub.customers, ...ub.movers], now);
console.log(
  `terms=${(terms.rows.terms as unknown[]).length} agreements=${(terms.rows.termsAgreements as unknown[]).length}`,
);

const comm = generateCommunity(config, regions, ub.customers, ub.movers, now);
console.log(
  `favorites=${(comm.rows.favoriteMovers as unknown[]).length} residence=${(comm.rows.residenceReviews as unknown[]).length} giveaways=${(comm.rows.giveaways as unknown[]).length}`,
);

const notif = generateNotifications(ub.customers, ub.movers, now);
console.log(`notifications=${notif.length}`);

const rv = flow.rows.reviews as { id: number; isHidden: boolean }[];
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
console.log(
  `notices=${(admin.rows.notices as unknown[]).length} inquiries=${(admin.rows.inquiries as unknown[]).length} reports=${(admin.rows.reports as unknown[]).length} suspensions=${(admin.rows.userSuspensions as unknown[]).length} logs=${(admin.rows.activityLogs as unknown[]).length}`,
);

/* ── 불변식 검사 ─────────────────────────────────────────────── */
let fail = 0;
const check = (name: string, bad: number) => {
  if (bad === 0) console.log(`  OK  ${name}`);
  else {
    console.log(`  FAIL ${name}: ${bad}`);
    fail += 1;
  }
};

type R = {
  id: number;
  customerId: string;
  status: string;
  isActive: boolean;
  moveDate: Date;
  expiresAt: Date;
  createdAt: Date;
  confirmedEstimateId: number | null;
};
type E = {
  id: number;
  estimateRequestId: number;
  moverId: string;
  status: string;
  createdAt: Date;
  confirmedAt: Date | null;
};
type V = { id: number; customerId: string; moverId: string; estimateId: number; createdAt: Date };

const reqs = flow.rows.estimateRequests as R[];
const ests = flow.rows.estimates as E[];
const revs = flow.rows.reviews as V[];
const rooms = flow.rows.chatRooms as {
  id: number;
  estimateId: number;
  customerId: string;
  moverId: string;
  lastMessageAt: Date | null;
}[];
const msgs = flow.rows.chatMessages as { roomId: number; createdAt: Date }[];

const reqById = new Map(reqs.map((r) => [r.id, r]));
const estById = new Map(ests.map((e) => [e.id, e]));
const confirmedByReq = new Map(flow.confirmedLinks.map((l) => [l.requestId, l.estimateId]));

// unique 제약
check("request id unique", reqs.length - new Set(reqs.map((r) => r.id)).size);
check("estimate id unique", ests.length - new Set(ests.map((e) => e.id)).size);
check(
  "estimate (req,mover) unique",
  ests.length - new Set(ests.map((e) => `${e.estimateRequestId}|${e.moverId}`)).size,
);
check("review estimateId unique", revs.length - new Set(revs.map((r) => r.estimateId)).size);
check("chatroom estimateId unique", rooms.length - new Set(rooms.map((r) => r.estimateId)).size);
check(
  "user email unique",
  (ub.rows.users as { email: string }[]).length -
    new Set((ub.rows.users as { email: string }[]).map((u) => u.email)).size,
);
check(
  "user phone unique",
  (ub.rows.users as { phone: string }[]).length -
    new Set((ub.rows.users as { phone: string }[]).map((u) => u.phone)).size,
);
check("mover nickname unique", ub.movers.length - new Set(ub.movers.map((m) => m.nickname)).size);
check(
  "unavailable (mover,date) unique",
  (ub.rows.moverUnavailableDates as { moverId: string; date: Date }[]).length -
    new Set(
      (ub.rows.moverUnavailableDates as { moverId: string; date: Date }[]).map(
        (d) => `${d.moverId}|${d.date.toISOString()}`,
      ),
    ).size,
);
check(
  "notification (user,type,source) unique",
  notif.length -
    new Set(
      (notif as { userId: string; type: string; sourceId: string }[]).map(
        (n) => `${n.userId}|${n.type}|${n.sourceId}`,
      ),
    ).size,
);
check(
  "terms (type,version) unique",
  (terms.rows.terms as { type: string; version: string }[]).length -
    new Set(
      (terms.rows.terms as { type: string; version: string }[]).map(
        (t) => `${t.type}|${t.version}`,
      ),
    ).size,
);
check(
  "favorite (cust,mover) unique",
  (comm.rows.favoriteMovers as { customerId: string; moverId: string }[]).length -
    new Set(
      (comm.rows.favoriteMovers as { customerId: string; moverId: string }[]).map(
        (f) => `${f.customerId}|${f.moverId}`,
      ),
    ).size,
);
check(
  "report unique",
  (admin.rows.reports as { targetType: string; targetId: string; reporterId: string }[]).length -
    new Set(
      (admin.rows.reports as { targetType: string; targetId: string; reporterId: string }[]).map(
        (r) => `${r.targetType}|${r.targetId}|${r.reporterId}`,
      ),
    ).size,
);
// 부분 unique: PENDING/SELECTED 인 활성 신청만 글·유저당 1건 (재신청 허용 마이그레이션)
{
  const active = (
    comm.rows.giveawayRequests as { giveawayId: number; requesterId: string; status: string }[]
  ).filter((g) => g.status === "PENDING" || g.status === "SELECTED");
  check(
    "giveaway 활성신청 (gid,requester) unique",
    active.length - new Set(active.map((g) => `${g.giveawayId}|${g.requesterId}`)).size,
  );
  const sel = (comm.rows.giveawayRequests as { giveawayId: number; status: string }[]).filter(
    (g) => g.status === "SELECTED",
  );
  check("giveaway 글당 SELECTED 1건", sel.length - new Set(sel.map((g) => g.giveawayId)).size);
}
check(
  "giveaway image (gid,order) unique",
  (comm.rows.giveawayImages as { giveawayId: number; sortOrder: number }[]).length -
    new Set(
      (comm.rows.giveawayImages as { giveawayId: number; sortOrder: number }[]).map(
        (g) => `${g.giveawayId}|${g.sortOrder}`,
      ),
    ).size,
);

// 상태 정합
check(
  "COMPLETED/CONFIRMED has confirmed estimate",
  reqs.filter(
    (r) => (r.status === "COMPLETED" || r.status === "CONFIRMED") && !confirmedByReq.has(r.id),
  ).length,
);
check(
  "EXPIRED/CANCELED/OPEN/PENDING no confirmed",
  reqs.filter(
    (r) =>
      ["EXPIRED", "CANCELED", "OPEN", "PENDING"].includes(r.status) && confirmedByReq.has(r.id),
  ).length,
);
check(
  "one confirmed estimate per request",
  ests.filter((e) => e.status === "CONFIRMED").length -
    new Set(ests.filter((e) => e.status === "CONFIRMED").map((e) => e.estimateRequestId)).size,
);
check(
  "active request per customer <=1",
  (() => {
    const m = new Map<string, number>();
    for (const r of reqs) if (r.isActive) m.set(r.customerId, (m.get(r.customerId) ?? 0) + 1);
    return [...m.values()].filter((v) => v > 1).length;
  })(),
);
check(
  "expiresAt = moveDate - 1d",
  reqs.filter((r) => Math.abs(r.expiresAt.getTime() - (r.moveDate.getTime() - 86400000)) > 86400000)
    .length,
);
check(
  "PENDING has no estimates",
  (() => {
    const p = new Set(reqs.filter((r) => r.status === "PENDING").map((r) => r.id));
    return ests.filter((e) => p.has(e.estimateRequestId)).length;
  })(),
);

// 시간축
check(
  "estimate.createdAt >= request.createdAt",
  ests.filter((e) => {
    const r = reqById.get(e.estimateRequestId);
    return r && e.createdAt.getTime() < r.createdAt.getTime();
  }).length,
);
check(
  "confirmedAt >= estimate.createdAt",
  ests.filter((e) => e.confirmedAt && e.confirmedAt.getTime() < e.createdAt.getTime()).length,
);
check(
  "confirmedAt <= moveDate",
  ests.filter((e) => {
    const r = reqById.get(e.estimateRequestId);
    return e.confirmedAt && r && e.confirmedAt.getTime() > r.moveDate.getTime() + 86400000;
  }).length,
);
check(
  "review.createdAt > moveDate",
  revs.filter((v) => {
    const e = estById.get(v.estimateId);
    const r = e && reqById.get(e.estimateRequestId);
    return r && v.createdAt.getTime() < r.moveDate.getTime();
  }).length,
);
check(
  "request.createdAt < moveDate",
  reqs.filter((r) => r.createdAt.getTime() >= r.moveDate.getTime()).length,
);

// 리뷰 정합
check(
  "review only on CONFIRMED est",
  revs.filter((v) => estById.get(v.estimateId)?.status !== "CONFIRMED").length,
);
check(
  "review only on COMPLETED req",
  revs.filter((v) => {
    const e = estById.get(v.estimateId);
    return !e || reqById.get(e.estimateRequestId)?.status !== "COMPLETED";
  }).length,
);
check(
  "review.customerId == req.customerId",
  revs.filter((v) => {
    const e = estById.get(v.estimateId);
    const r = e && reqById.get(e.estimateRequestId);
    return !r || r.customerId !== v.customerId;
  }).length,
);
check(
  "review.moverId == est.moverId",
  revs.filter((v) => estById.get(v.estimateId)?.moverId !== v.moverId).length,
);

// 채팅
const lastMsg = new Map<number, number>();
for (const m of msgs)
  lastMsg.set(m.roomId, Math.max(lastMsg.get(m.roomId) ?? 0, m.createdAt.getTime()));
check(
  "room.lastMessageAt matches",
  rooms.filter((r) => (r.lastMessageAt?.getTime() ?? 0) !== (lastMsg.get(r.id) ?? 0)).length,
);
check(
  "room only for confirmed est",
  rooms.filter((r) => estById.get(r.estimateId)?.status !== "CONFIRMED").length,
);

// 나눔
const gws = comm.rows.giveaways as {
  id: number;
  status: string;
  receiverId: string | null;
  authorId: string;
}[];
check(
  "giveaway status/receiver",
  gws.filter((g) => (g.status === "AVAILABLE") !== (g.receiverId === null)).length,
);
check(
  "giveaway no self-request",
  (() => {
    const byId = new Map(gws.map((g) => [g.id, g]));
    return (comm.rows.giveawayRequests as { giveawayId: number; requesterId: string }[]).filter(
      (r) => byId.get(r.giveawayId)?.authorId === r.requesterId,
    ).length;
  })(),
);

// 통계 캐시
const stats = comm.rows.regionReviewStatistics as {
  regionId: number;
  ratingSum: number;
  reviewCount: number;
}[];
const rr = comm.rows.residenceReviews as { regionId: number; rating: number; isHidden: boolean }[];
check(
  "region stat matches",
  stats.filter((s) => {
    const v = rr.filter((x) => x.regionId === s.regionId && !x.isHidden);
    return s.reviewCount !== v.length || s.ratingSum !== v.reduce((a, b) => a + b.rating, 0);
  }).length,
);

// 약관
check(
  "every member has agreement",
  (() => {
    const has = new Set((terms.rows.termsAgreements as { userId: string }[]).map((a) => a.userId));
    return [...ub.customers, ...ub.movers].filter((m) => !has.has(m.id)).length;
  })(),
);
check(
  "published unique per type",
  (() => {
    const p = (terms.rows.terms as { type: string; status: string }[]).filter(
      (t) => t.status === "PUBLISHED",
    );
    return p.length - new Set(p.map((t) => t.type)).size;
  })(),
);

// 이미지 키
check(
  "imageUrl is S3 key not URL",
  [
    ...(ub.rows.customerProfiles as { imageUrl: string | null }[]),
    ...(ub.rows.moverProfiles as { imageUrl: string | null }[]),
  ].filter((p) => p.imageUrl?.startsWith("http")).length,
);

// HIDE 로그 memo
check(
  "HIDE log has memo",
  (admin.rows.activityLogs as { action: string; memo: string | null }[]).filter(
    (l) => l.action === "HIDE" && !l.memo,
  ).length,
);
check(
  "hidden review has HIDE log",
  (() => {
    const logged = new Set(
      (admin.rows.activityLogs as { action: string; targetType: string; targetId: string }[])
        .filter((l) => l.action === "HIDE" && l.targetType === "REVIEW")
        .map((l) => l.targetId),
    );
    return rv.filter((r) => r.isHidden && !logged.has(String(r.id))).length;
  })(),
);

// 문의
const inqs = admin.rows.inquiries as {
  id: number;
  status: string;
  lastMessageAt: Date;
  handledBy: string | null;
}[];
const imsgs = admin.rows.inquiryMessages as {
  inquiryId: number;
  createdAt: Date;
  isAdmin: boolean;
}[];
const lastInq = new Map<number, number>();
for (const m of imsgs)
  lastInq.set(m.inquiryId, Math.max(lastInq.get(m.inquiryId) ?? 0, m.createdAt.getTime()));
check(
  "inquiry.lastMessageAt matches",
  inqs.filter((i) => i.lastMessageAt.getTime() !== (lastInq.get(i.id) ?? 0)).length,
);
check(
  "ANSWERED/CLOSED has admin msg",
  (() => {
    const adminMsg = new Set(imsgs.filter((m) => m.isAdmin).map((m) => m.inquiryId));
    return inqs.filter((i) => i.status !== "OPEN" && !adminMsg.has(i.id)).length;
  })(),
);

// 정지
const susp = admin.rows.userSuspensions as { userId: string; action: string }[];
check(
  "inactive user has SUSPEND",
  (() => {
    const s = new Set(susp.filter((x) => x.action === "SUSPEND").map((x) => x.userId));
    return [...ub.customers, ...ub.movers].filter((u) => !u.isActive && !s.has(u.id)).length;
  })(),
);

// 분포 샘플
const ratingDist = [0, 0, 0, 0, 0];
for (const v of revs) ratingDist[(v as unknown as { rating: number }).rating - 1]!++;
console.log(
  `rating dist 1~5: ${ratingDist.map((n) => ((n / revs.length) * 100).toFixed(0) + "%").join(" ")}`,
);
const perCust = new Map<string, number>();
for (const r of reqs) perCust.set(r.customerId, (perCust.get(r.customerId) ?? 0) + 1);
const counts = [...perCust.values()].sort((a, b) => a - b);
console.log(
  `req/customer: p50=${counts[Math.floor(counts.length * 0.5)]} p90=${counts[Math.floor(counts.length * 0.9)]} max=${counts[counts.length - 1]} zero=${config.customers - perCust.size}`,
);
const perMover = new Map<string, number>();
for (const v of revs) perMover.set(v.moverId, (perMover.get(v.moverId) ?? 0) + 1);
const mc = [...perMover.values()].sort((a, b) => a - b);
console.log(
  `reviews/mover: p50=${mc[Math.floor(mc.length * 0.5)]} p90=${mc[Math.floor(mc.length * 0.9)]} max=${mc[mc.length - 1]} zero=${config.movers - perMover.size}`,
);
const authProv = new Map<string, number>();
for (const u of ub.rows.users as { authProvider: string }[])
  authProv.set(u.authProvider, (authProv.get(u.authProvider) ?? 0) + 1);
console.log(`auth: ${[...authProv].map(([k, v]) => `${k}=${v}`).join(" ")}`);

console.log(fail === 0 ? "\nALL INVARIANTS PASS" : `\n${fail} INVARIANT FAILURES`);
process.exit(fail === 0 ? 0 : 1);
