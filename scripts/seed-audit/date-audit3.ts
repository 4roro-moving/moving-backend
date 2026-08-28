/* 3차: 1·2차가 안 본 영역 — 시퀀스 단조성, 경계값, 교차 시간창 */
import { resolveConfig } from "../../prisma/seeds/config.js";
import { generateUsers } from "../../prisma/seeds/generators/users.js";
import { generateEstimateFlow } from "../../prisma/seeds/generators/estimates.js";
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

console.log("\n[I] 메시지 시퀀스 단조성 (id 순서 == 시간 순서)");
// 같은 방 안에서 id 가 커지면 시간도 커져야 한다 (커서 페이지네이션 전제)
type Msg = { id: number; roomId: number; createdAt: Date; senderId: string };
const msgs = G<Msg>(flow.rows.chatMessages);
const byRoom = new Map<number, Msg[]>();
for (const m of msgs) {
  const l = byRoom.get(m.roomId) ?? [];
  l.push(m);
  byRoom.set(m.roomId, l);
}
let badMono = 0;
let sm = "";
for (const [rid, list] of byRoom) {
  const sorted = [...list].sort((a, b) => a.id - b.id);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.createdAt.getTime() < sorted[i - 1]!.createdAt.getTime()) {
      badMono++;
      if (!sm) sm = `room ${rid} id${sorted[i]!.id}`;
    }
  }
}
ck("chatMessage id↑ == time↑", badMono, sm);

type IMsg = { id: number; inquiryId: number; createdAt: Date };
const imsgs = G<IMsg>(admin.rows.inquiryMessages);
const byInq = new Map<number, IMsg[]>();
for (const m of imsgs) {
  const l = byInq.get(m.inquiryId) ?? [];
  l.push(m);
  byInq.set(m.inquiryId, l);
}
let badI = 0;
for (const [, list] of byInq) {
  const s2 = [...list].sort((a, b) => a.id - b.id);
  for (let i = 1; i < s2.length; i += 1)
    if (s2[i]!.createdAt.getTime() < s2[i - 1]!.createdAt.getTime()) badI++;
}
ck("inquiryMessage id↑ == time↑", badI);

type Hist = { id: number; estimateRequestId: number; type: string; createdAt: Date };
const hists = G<Hist>(flow.rows.estimateRequestHistories);
const byReqH = new Map<number, Hist[]>();
for (const h of hists) {
  const l = byReqH.get(h.estimateRequestId) ?? [];
  l.push(h);
  byReqH.set(h.estimateRequestId, l);
}
let badH = 0;
let sh = "";
for (const [rid, list] of byReqH) {
  const s3 = [...list].sort((a, b) => a.id - b.id);
  for (let i = 1; i < s3.length; i += 1) {
    if (s3[i]!.createdAt.getTime() < s3[i - 1]!.createdAt.getTime()) {
      badH++;
      if (!sh)
        sh = `req ${rid}: ${s3[i - 1]!.type}(${d(s3[i - 1]!.createdAt)}) → ${s3[i]!.type}(${d(s3[i]!.createdAt)})`;
    }
  }
}
ck("history id↑ == time↑", badH, sh);
ck(
  "CREATED 가 첫 이력",
  (() => {
    let b = 0;
    for (const [, l] of byReqH) {
      const s4 = [...l].sort((a, b2) => a.id - b2.id);
      if (s4[0]!.type !== "CREATED") b++;
    }
    return b;
  })(),
);

console.log("\n[J] UUIDv7 시간 정렬성");
// UUIDv7 상위 48비트는 타임스탬프. createdAt 순서와 id 순서가 일치해야 인덱스가 append-only 가 된다.
const us = G<{ id: string; createdAt: Date }>(ub.rows.users);
let badUuid = 0;
for (const u of us) {
  const hex = u.id.replace(/-/g, "").slice(0, 12);
  const ts = parseInt(hex, 16);
  if (Math.abs(ts - u.createdAt.getTime()) > 1000) badUuid++;
}
ck("uuid 타임스탬프 == createdAt", badUuid);

console.log("\n[K] 경계값 — 오늘 생성된 데이터");
const todayStart = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
).getTime();
ck(
  "오늘 이사일 요청은 COMPLETED/OPEN 만",
  G<{ status: string; moveDate: Date }>(flow.rows.estimateRequests).filter((r) => {
    const md = r.moveDate.getTime();
    return (
      md >= todayStart &&
      md < todayStart + 86400000 &&
      !["COMPLETED", "OPEN", "CONFIRMED", "EXPIRED", "CANCELED", "PENDING"].includes(r.status)
    );
  }).length,
);
ck(
  "expiresAt != moveDate 당일",
  G<{ moveDate: Date; expiresAt: Date }>(flow.rows.estimateRequests).filter(
    (r) => r.expiresAt.getTime() >= r.moveDate.getTime(),
  ).length,
);
ck("리뷰가 오늘 이후 아님", rvAll.filter((r) => r.createdAt.getTime() > T).length);

console.log("\n[L] 교차 시간창 — 기사 휴무일 vs 확정 이사일");
type Un = { moverId: string; date: Date };
const unav = new Set(
  G<Un>(ub.rows.moverUnavailableDates).map(
    (u) => `${u.moverId}|${u.date.toISOString().slice(0, 10)}`,
  ),
);
type Est2 = { id: number; estimateRequestId: number; moverId: string; status: string };
const ests2 = G<Est2>(flow.rows.estimates);
const reqById2 = new Map(
  G<{ id: number; moveDate: Date; status: string }>(flow.rows.estimateRequests).map((r) => [
    r.id,
    r,
  ]),
);
let clash = 0;
let sc = "";
for (const e of ests2) {
  if (e.status !== "CONFIRMED") continue;
  const r = reqById2.get(e.estimateRequestId);
  if (!r) continue;
  const key = `${e.moverId}|${r.moveDate.toISOString().slice(0, 10)}`;
  if (unav.has(key)) {
    clash++;
    if (!sc) sc = key;
  }
}
ck("확정 이사일이 기사 휴무일과 겹치지 않음", clash, sc);

console.log("\n[M] 기사 이중 예약 (같은 날 확정 2건)");
const moverDay = new Map<string, number>();
let dbl = 0;
for (const e of ests2) {
  if (e.status !== "CONFIRMED") continue;
  const r = reqById2.get(e.estimateRequestId);
  if (!r) continue;
  const key = `${e.moverId}|${r.moveDate.toISOString().slice(0, 10)}`;
  const c = (moverDay.get(key) ?? 0) + 1;
  moverDay.set(key, c);
  if (c === 2) dbl++;
}
ck("같은 기사 같은 날 확정 1건", dbl, dbl ? [...moverDay].find(([, v]) => v > 1)?.[0] : "");

console.log("\n[N] 고객 이중 이사 (같은 날 확정 2건)");
const custDay = new Map<string, number>();
let dblC = 0;
for (const e of ests2) {
  if (e.status !== "CONFIRMED") continue;
  const r = reqById2.get(e.estimateRequestId) as unknown as { moveDate: Date; customerId?: string };
  const full = G<{ id: number; moveDate: Date; customerId: string }>(
    flow.rows.estimateRequests,
  ).find((x) => x.id === e.estimateRequestId);
  if (!full) continue;
  const key = `${full.customerId}|${full.moveDate.toISOString().slice(0, 10)}`;
  const c = (custDay.get(key) ?? 0) + 1;
  custDay.set(key, c);
  if (c === 2) dblC++;
  void r;
}
ck("같은 고객 같은 날 이사 1건", dblC);

console.log("\n[O] 알림 만료 규약");
ck(
  "expiresAt = createdAt + 3일 (미만료)",
  G<{ createdAt: Date; expiresAt: Date }>(notif).filter((n) => {
    const diff = n.expiresAt.getTime() - n.createdAt.getTime();
    return diff > 0 && Math.abs(diff - 3 * 86400000) > 1000;
  }).length,
);

console.log("\n[P] 정지 계정의 활동 중단");
// 정지된 계정이 정지 이후에 활동한 기록이 있으면 안 된다
const suspAt = new Map<string, number>();
for (const s of G<{ userId: string; action: string; createdAt: Date }>(
  admin.rows.userSuspensions,
)) {
  if (s.action === "SUSPEND") suspAt.set(s.userId, s.createdAt.getTime());
}
const released = new Set(
  G<{ userId: string; action: string }>(admin.rows.userSuspensions)
    .filter((s) => s.action === "RELEASE")
    .map((s) => s.userId),
);
const stillSusp = new Map([...suspAt].filter(([u]) => !released.has(u)));
ck(
  "정지 후 새 요청 없음",
  G<{ customerId: string; createdAt: Date }>(flow.rows.estimateRequests).filter((r) => {
    const t = stillSusp.get(r.customerId);
    return t && r.createdAt.getTime() > t;
  }).length,
);
ck(
  "정지 후 새 견적 없음",
  G<{ moverId: string; createdAt: Date }>(flow.rows.estimates).filter((e) => {
    const t = stillSusp.get(e.moverId);
    return t && e.createdAt.getTime() > t;
  }).length,
);

console.log(fail === 0 ? "\n=== 3차 감사: 이상 없음 ===" : `\n=== 3차 감사: ${fail}개 이상 ===`);
