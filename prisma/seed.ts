/*
 * ============================================================================
 *  무빙 시드 엔트리포인트
 * ============================================================================
 *
 *  실행
 *    npm run prisma:seed                    # dev 프리셋 (기본)
 *    SEED_PRESET=full npm run prisma:seed   # 실사용자 규모
 *    SEED_SKIP_IMAGES=1 SEED_PRESET=full npm run prisma:seed
 *    SEED_SKIP_VERIFY=1 ...                 # 검증 생략(권장하지 않음)
 *
 *  설계 요약
 *  ─────────
 *   1) TRUNCATE ... RESTART IDENTITY CASCADE 로 전부 비우고 시작한다.
 *      upsert 기반 멱등성은 계정 수만큼 왕복이 생겨 이 규모에서 쓸 수 없다.
 *
 *   2) PK 를 적재 전에 정한다. User 는 UUIDv7 을 Node 에서 만들고,
 *      나머지는 Int 를 명시적으로 배정한다. 덕분에 FK 조립에 DB 왕복이 0 이다.
 *
 *   3) 전체를 하나의 트랜잭션으로 감싸지 않는다. 청크 단위 createMany 로
 *      흘려보내고, 실패하면 다시 처음부터 돌리면 된다(1번 덕분에 안전).
 *
 *   4) 비정규화 캐시(리뷰 통계 등)는 마지막에 SQL 한 문장으로 맞춘다.
 *
 *   5) 끝나면 시퀀스를 setval 하고 ANALYZE 한 뒤 정합성 검증을 돌린다.
 * ============================================================================
 */

import "dotenv/config";

import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

import {
  MASTER_SEED,
  SALT_ROUNDS,
  TEST_PASSWORD,
  resolveConfig,
  targetReviewCount,
  totalRequests,
} from "./seeds/config.js";
import { analyze, loadMany, syncSequences, truncateAll } from "./seeds/lib/loader.js";
import { generateAdminContent } from "./seeds/generators/admin.js";
import { generateCommunity } from "./seeds/generators/community.js";
import { generateEstimateFlow } from "./seeds/generators/estimates.js";
import { generateNotifications } from "./seeds/generators/notifications.js";
import { seedRegions } from "./seeds/generators/regions.js";
import { linkConfirmedEstimates, syncMoverStats } from "./seeds/generators/stats.js";
import { generateTerms } from "./seeds/generators/terms.js";
import { generateUsers } from "./seeds/generators/users.js";
import {
  copyProfileImages,
  ensureSourceImages,
  makeS3Client,
} from "./seeds/images/profile-images.js";
import { printSummary, verify } from "./seeds/verify.js";

const prisma = new PrismaClient({ log: ["warn", "error"] });

function section(title: string): void {
  console.log("");
  console.log(`── ${title} ${"─".repeat(Math.max(0, 48 - title.length))}`);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const config = resolveConfig();
  const now = new Date();

  console.log("");
  console.log("════════════════════════════════════════════════════");
  console.log(`  무빙 시드 — ${config.name.toUpperCase()} 프리셋`);
  console.log("════════════════════════════════════════════════════");
  console.log(
    `  고객 ${config.customers.toLocaleString("ko-KR")} / 기사 ${config.movers.toLocaleString("ko-KR")} / 관리자 ${config.admins}`,
  );
  console.log(
    `  견적요청 ${totalRequests(config).toLocaleString("ko-KR")} (완료 ${config.requests.completed.toLocaleString("ko-KR")})`,
  );
  console.log(`  리뷰 목표 ${targetReviewCount(config).toLocaleString("ko-KR")}`);
  console.log(`  프로필 이미지 S3 복사: ${config.copyProfileImages ? "예" : "아니오"}`);
  console.log("════════════════════════════════════════════════════");

  /* ── 0. 초기화 ──────────────────────────────────────────────────── */

  section("초기화");
  await truncateAll(prisma);

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);
  console.log("  ✅ 비밀번호 해시 1회 계산 (전 계정 공유)");

  /* ── 1. 지역 ────────────────────────────────────────────────────── */

  section("지역");
  const regions = await seedRegions(prisma);

  /* ── 2. 계정 생성 (메모리) ──────────────────────────────────────── */

  section("계정 생성");
  console.log("  … UUID·프로필·서비스지역 생성 중");

  const userBundle = generateUsers(config, regions, passwordHash, now);

  console.log(
    `  ✅ 메모리 생성 완료 — 고객 ${userBundle.customers.length.toLocaleString("ko-KR")}, 기사 ${userBundle.movers.length.toLocaleString("ko-KR")}, 관리자 ${userBundle.admins.length}`,
  );

  await loadMany("users", prisma.user, userBundle.rows.users as never[]);
  await loadMany(
    "customer_profiles",
    prisma.customerProfile,
    userBundle.rows.customerProfiles as never[],
  );
  await loadMany("mover_profiles", prisma.moverProfile, userBundle.rows.moverProfiles as never[]);
  await loadMany(
    "customer_service_areas",
    prisma.customerServiceArea,
    userBundle.rows.customerServiceAreas as never[],
  );
  await loadMany(
    "customer_service_types",
    prisma.customerServiceType,
    userBundle.rows.customerServiceTypes as never[],
  );
  await loadMany(
    "mover_service_areas",
    prisma.moverServiceArea,
    userBundle.rows.moverServiceAreas as never[],
  );
  await loadMany(
    "mover_service_types",
    prisma.moverServiceType,
    userBundle.rows.moverServiceTypes as never[],
  );
  await loadMany(
    "mover_unavailable_dates",
    prisma.moverUnavailableDate,
    userBundle.rows.moverUnavailableDates as never[],
  );

  /* ── 3. 약관 + 동의 이력 ────────────────────────────────────────── */

  section("약관");
  const termsResult = generateTerms(
    userBundle.admins,
    [...userBundle.customers, ...userBundle.movers],
    now,
  );

  await loadMany("terms", prisma.terms, termsResult.rows.terms as never[]);
  await loadMany(
    "terms_agreements",
    prisma.termsAgreement,
    termsResult.rows.termsAgreements as never[],
  );

  /* ── 4. 견적 흐름 (핵심) ────────────────────────────────────────── */

  section("견적 흐름");
  console.log("  … 요청·견적·리뷰·채팅 생성 중 (시간이 걸립니다)");

  const flow = generateEstimateFlow(
    config,
    regions,
    userBundle.customers,
    userBundle.movers,
    userBundle.rows.moverUnavailableDates as { moverId: string; date: Date }[],
    now,
  );

  console.log(
    `  ✅ 메모리 생성 완료 — 요청 ${flow.stats.requests.toLocaleString("ko-KR")}, 견적 ${flow.stats.estimates.toLocaleString("ko-KR")}, 리뷰 ${flow.stats.reviews.toLocaleString("ko-KR")}`,
  );

  await loadMany(
    "estimate_requests",
    prisma.estimateRequest,
    flow.rows.estimateRequests as never[],
  );
  await loadMany(
    "estimate_request_histories",
    prisma.estimateRequestHistory,
    flow.rows.estimateRequestHistories as never[],
  );
  await loadMany(
    "designated_movers",
    prisma.designatedMover,
    flow.rows.designatedMovers as never[],
  );
  await loadMany("estimates", prisma.estimate, flow.rows.estimates as never[]);
  await loadMany(
    "estimate_request_rejections",
    prisma.estimateRequestRejection,
    flow.rows.estimateRequestRejections as never[],
  );

  // 견적이 들어간 뒤에야 FK 를 걸 수 있다
  await linkConfirmedEstimates(prisma, flow.confirmedLinks);

  await loadMany("reviews", prisma.review, flow.rows.reviews as never[]);
  await loadMany("chat_rooms", prisma.chatRoom, flow.rows.chatRooms as never[]);
  await loadMany("chat_messages", prisma.chatMessage, flow.rows.chatMessages as never[]);

  /* ── 5. 커뮤니티 ────────────────────────────────────────────────── */

  section("커뮤니티");
  const community = generateCommunity(
    config,
    regions,
    userBundle.customers,
    userBundle.movers,
    now,
  );

  await loadMany("favorite_movers", prisma.favoriteMover, community.rows.favoriteMovers as never[]);
  await loadMany(
    "residence_reviews",
    prisma.residenceReview,
    community.rows.residenceReviews as never[],
  );
  await loadMany(
    "region_review_statistics",
    prisma.regionReviewStatistic,
    community.rows.regionReviewStatistics as never[],
  );
  await loadMany("giveaways", prisma.giveaway, community.rows.giveaways as never[]);
  await loadMany("giveaway_images", prisma.giveawayImage, community.rows.giveawayImages as never[]);
  await loadMany(
    "giveaway_requests",
    prisma.giveawayRequest,
    community.rows.giveawayRequests as never[],
  );

  /* ── 6. 관리자 콘텐츠 ───────────────────────────────────────────── */

  section("관리자 콘텐츠");

  const reviewRows = flow.rows.reviews as { id: number; isHidden: boolean; createdAt: Date }[];

  const adminContent = generateAdminContent(
    config,
    userBundle.admins,
    userBundle.customers,
    userBundle.movers,
    {
      reviews: reviewRows.map((r) => ({ id: r.id, createdAt: r.createdAt })),
      hiddenReviews: reviewRows
        .filter((r) => r.isHidden)
        .map((r) => ({ id: r.id, createdAt: r.createdAt })),
      residenceReviews: (community.rows.residenceReviews as { id: number; createdAt: Date }[]).map(
        (r) => ({ id: r.id, createdAt: r.createdAt }),
      ),
      giveaways: (community.rows.giveaways as { id: number; createdAt: Date }[]).map((g) => ({
        id: g.id,
        createdAt: g.createdAt,
      })),
      lastActivityByUser: flow.lastActivityByUser,
    },
    now,
  );

  await loadMany("notices", prisma.notice, adminContent.rows.notices as never[]);
  await loadMany("faqs", prisma.faq, adminContent.rows.faqs as never[]);
  await loadMany("inquiries", prisma.inquiry, adminContent.rows.inquiries as never[]);
  await loadMany(
    "inquiry_messages",
    prisma.inquiryMessage,
    adminContent.rows.inquiryMessages as never[],
  );
  await loadMany("reports", prisma.report, adminContent.rows.reports as never[]);
  await loadMany(
    "user_suspensions",
    prisma.userSuspension,
    adminContent.rows.userSuspensions as never[],
  );
  await loadMany("activity_logs", prisma.activityLog, adminContent.rows.activityLogs as never[]);

  /* ── 7. 알림 ────────────────────────────────────────────────────── */

  section("알림");
  const notifications = generateNotifications(userBundle.customers, userBundle.movers, now);
  await loadMany("notifications", prisma.notification, notifications as never[]);

  /* ── 8. 비정규화 캐시 정리 ──────────────────────────────────────── */

  section("캐시 동기화");
  await syncMoverStats(prisma);

  /* ── 9. 시퀀스 + 통계 ───────────────────────────────────────────── */

  section("마무리");
  await syncSequences(prisma);
  await analyze(prisma);

  /* ── 10. 프로필 이미지 S3 복사 ──────────────────────────────────── */

  if (config.copyProfileImages) {
    section("프로필 이미지");

    try {
      const { s3, bucket } = makeS3Client();

      await ensureSourceImages(s3, bucket);

      const imageKeys = [
        ...userBundle.customers.map((c) => c.imageKey),
        ...userBundle.movers.map((m) => m.imageKey),
      ].filter((key): key is string => key !== null);

      await copyProfileImages(s3, bucket, imageKeys);
    } catch (error) {
      /*
       * 이미지 복사가 실패해도 DB 데이터 자체는 유효하다.
       * (이미지가 없으면 화면에서 깨져 보일 뿐)
       * 시드 전체를 실패시키지 않고 경고만 남긴다.
       */
      console.warn("  ⚠️  프로필 이미지 복사 실패 — DB 데이터는 정상입니다");
      console.warn(`     ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* ── 11. 검증 ───────────────────────────────────────────────────── */

  await printSummary(prisma);

  if (process.env.SEED_SKIP_VERIFY !== "1") {
    const ok = await verify(prisma);

    if (!ok) {
      throw new Error("정합성 검증에 실패했습니다.");
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log("");
  console.log("════════════════════════════════════════════════════");
  console.log(`  🎉 시드 완료 (${elapsed}s)`);
  console.log("────────────────────────────────────────────────────");
  console.log(`  공통 비밀번호 : ${TEST_PASSWORD}`);
  console.log(`  관리자        : admin1@test.com ~ admin${config.admins}@test.com`);
  console.log(`  고객          : customer001@test.com ~`);
  console.log(`  기사          : mover001@test.com ~`);
  console.log("");
  console.log("  앵커 계정(1~100번) 배치 내 위치별 시나리오");
  console.log("    1~2번  : 신규 계정 (요청·이력 없음)");
  console.log("    3~4번  : OPEN 요청만, 견적 대기");
  console.log("    5~6번  : OPEN 요청 + 견적 도착");
  console.log("    7~8번  : 위 + 과거 미작성 리뷰 보유");
  console.log("    9번    : 정지된 계정 (009, 019, …)");
  console.log("    10번   : 정지 → 해제된 계정 (010, 020, …)");
  console.log("");
  console.log(`  ⚠️  소셜 가입 계정은 password 가 null 이라 로그인이 안 됩니다.`);
  console.log(`      비밀번호 로그인 테스트는 앵커 계정(1~100번)을 쓰세요.`);
  console.log(`  🎲 마스터 시드: ${MASTER_SEED} (같은 시드 = 같은 데이터)`);
  console.log("════════════════════════════════════════════════════");
  console.log("");
}

main()
  .catch((error: unknown) => {
    console.error("");
    console.error("❌ 시드 생성에 실패했습니다.");
    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
