/*
 * 정합성 검증
 * ============================================================================
 *
 *  적재가 끝난 뒤 반드시 실행한다. 모든 검사가 0 이어야 한다.
 *
 *  "데이터가 들어갔다"와 "데이터가 올바르다"는 다르다. 여기서 걸러내지 않으면
 *  나중에 화면에서 이상한 값을 보고 나서야 시드가 잘못됐음을 알게 되고,
 *  그때는 원인이 시드인지 앱인지 구분하기 어려워진다.
 * ============================================================================
 */

import type { PrismaClient } from "@prisma/client";

interface Check {
  name: string;
  sql: string;
  /** 왜 이게 문제인지 — 실패했을 때 보여준다 */
  why: string;
}

const CHECKS: Check[] = [
  {
    name: "리뷰 상태 정합",
    why: "리뷰는 CONFIRMED 견적 + COMPLETED 요청에만 달릴 수 있습니다 (review.policy.ts)",
    sql: `
      SELECT COUNT(*)::int AS n FROM "reviews" r
        JOIN "estimates" e ON e.id = r.estimate_id
        JOIN "estimate_requests" er ON er.id = e.estimate_request_id
       WHERE e.status <> 'CONFIRMED' OR er.status <> 'COMPLETED'
    `,
  },
  {
    name: "리뷰 작성자·대상 일치",
    why: "review.customerId 는 요청 고객, review.moverId 는 견적 기사와 같아야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "reviews" r
        JOIN "estimates" e ON e.id = r.estimate_id
        JOIN "estimate_requests" er ON er.id = e.estimate_request_id
       WHERE r.customer_id <> er."customerId" OR r.mover_id <> e.mover_id
    `,
  },
  {
    name: "리뷰 작성 시점",
    why: "이사가 끝나기 전에 리뷰를 쓸 수는 없습니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "reviews" r
        JOIN "estimates" e ON e.id = r.estimate_id
        JOIN "estimate_requests" er ON er.id = e.estimate_request_id
       WHERE r.created_at < er."moveDate"
    `,
  },
  {
    name: "COMPLETED 요청의 확정 견적",
    why: "완료된 요청에는 반드시 확정 견적이 있어야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "estimate_requests"
       WHERE status IN ('COMPLETED', 'CONFIRMED') AND "confirmedEstimateId" IS NULL
    `,
  },
  {
    name: "EXPIRED/CANCELED 요청의 확정 견적",
    why: "만료·취소된 요청에 확정 견적이 있으면 상태가 모순됩니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "estimate_requests"
       WHERE status IN ('EXPIRED', 'CANCELED', 'PENDING', 'OPEN')
         AND "confirmedEstimateId" IS NOT NULL
    `,
  },
  {
    name: "확정 견적의 요청 역참조",
    why: "confirmedEstimateId 가 가리키는 견적은 그 요청에 속해야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "estimate_requests" er
        JOIN "estimates" e ON e.id = er."confirmedEstimateId"
       WHERE e.estimate_request_id <> er.id OR e.status <> 'CONFIRMED'
    `,
  },
  {
    name: "요청당 확정 견적 1건",
    why: "한 요청에서 두 개의 견적이 CONFIRMED 일 수 없습니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM (
        SELECT estimate_request_id FROM "estimates"
         WHERE status = 'CONFIRMED'
         GROUP BY estimate_request_id HAVING COUNT(*) > 1
      ) t
    `,
  },
  {
    name: "고객당 활성 요청 1건",
    why: "고객은 동시에 하나의 활성 요청만 가질 수 있습니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM (
        SELECT "customerId" FROM "estimate_requests"
         WHERE "isActive" = true
         GROUP BY "customerId" HAVING COUNT(*) > 1
      ) t
    `,
  },
  {
    name: "견적 제출 시점",
    why: "요청이 생기기 전에 견적이 도착할 수는 없습니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "estimates" e
        JOIN "estimate_requests" er ON er.id = e.estimate_request_id
       WHERE e.created_at < er."createdAt"
    `,
  },
  {
    name: "확정 시점",
    why: "확정은 견적 제출 이후, 이사일 이전이어야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "estimates" e
        JOIN "estimate_requests" er ON er.id = e.estimate_request_id
       WHERE e.confirmed_at IS NOT NULL
         AND (e.confirmed_at < e.created_at OR e.confirmed_at::date > er."moveDate")
    `,
  },
  {
    name: "만료 시각 규약",
    why: "expiresAt 은 이사일 하루 전이어야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "estimate_requests"
       WHERE "expiresAt"::date <> ("moveDate" - INTERVAL '1 day')::date
    `,
  },
  {
    name: "기사 리뷰 통계 캐시",
    why: "MoverProfile.reviewCount / averageRating 이 공개 리뷰 집계와 달라집니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "mover_profiles" mp
        LEFT JOIN (
          SELECT mover_id, COUNT(*)::int c, ROUND(AVG(rating), 1) a
          FROM "reviews"
          WHERE is_hidden = false
          GROUP BY mover_id
        ) s ON s.mover_id = mp."userId"
       WHERE mp."reviewCount" <> COALESCE(s.c, 0)
          OR mp."averageRating" <> COALESCE(s.a, 0)
    `,
  },
  {
    name: "기사 확정 건수 캐시",
    why: "confirmedCount 정렬 결과가 실제와 어긋납니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "mover_profiles" mp
        LEFT JOIN (
          SELECT mover_id, COUNT(*)::int c FROM "estimates"
           WHERE status = 'CONFIRMED' GROUP BY mover_id
        ) s ON s.mover_id = mp."userId"
       WHERE mp."confirmedCount" <> COALESCE(s.c, 0)
    `,
  },
  {
    name: "채팅방 lastMessageAt",
    why: "목록 정렬 기준이므로 실제 마지막 메시지 시각과 같아야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "chat_rooms" cr
        LEFT JOIN (
          SELECT room_id, MAX(created_at) m FROM "chat_messages" GROUP BY room_id
        ) s ON s.room_id = cr.id
       WHERE cr.last_message_at IS DISTINCT FROM s.m
    `,
  },
  {
    name: "채팅방 참여자 일치",
    why: "채팅방의 고객·기사는 해당 견적의 당사자여야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "chat_rooms" cr
        JOIN "estimates" e ON e.id = cr.estimate_id
        JOIN "estimate_requests" er ON er.id = cr.estimate_request_id
       WHERE cr.mover_id <> e.mover_id OR cr.customer_id <> er."customerId"
    `,
  },
  {
    name: "지역 후기 통계 캐시",
    why: "isHidden=false 후기만 집계해야 합니다 (residence-review 로직과 동일)",
    sql: `
      SELECT COUNT(*)::int AS n FROM "region_review_statistics" rs
        LEFT JOIN (
          SELECT region_id, SUM(rating)::int s, COUNT(*)::int c
          FROM "residence_reviews" WHERE is_hidden = false GROUP BY region_id
        ) t ON t.region_id = rs.region_id
       WHERE rs.rating_sum <> COALESCE(t.s, 0) OR rs.review_count <> COALESCE(t.c, 0)
    `,
  },
  {
    name: "나눔 상태·수령자 일관성",
    why: "AVAILABLE 인데 수령자가 있거나, 완료인데 수령자가 없으면 모순입니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "giveaways"
       WHERE (status = 'AVAILABLE' AND receiver_id IS NOT NULL)
          OR (status IN ('IN_PROGRESS', 'COMPLETED') AND receiver_id IS NULL)
    `,
  },
  {
    name: "나눔 활성 신청 중복",
    why: "PENDING·SELECTED 는 글·유저당 1건입니다 (giveaway_requests_one_active_per_user_idx)",
    sql: `
      SELECT COUNT(*)::int AS n FROM (
        SELECT giveaway_id, requester_id FROM "giveaway_requests"
         WHERE status IN ('PENDING', 'SELECTED')
         GROUP BY giveaway_id, requester_id HAVING COUNT(*) > 1
      ) t
    `,
  },
  {
    name: "나눔 글당 SELECTED 1건",
    why: "giveaway_requests_one_selected_per_giveaway_idx 위반입니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM (
        SELECT giveaway_id FROM "giveaway_requests"
         WHERE status = 'SELECTED'
         GROUP BY giveaway_id HAVING COUNT(*) > 1
      ) t
    `,
  },
  {
    name: "기사 활동 거점 좌표 범위",
    why: "위경도가 한반도 밖이면 지도 마커가 엉뚱한 곳에 찍힙니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "mover_profiles"
       WHERE "activity_base_latitude" IS NOT NULL
         AND ("activity_base_latitude" NOT BETWEEN 32 AND 39
           OR "activity_base_longitude" NOT BETWEEN 124 AND 132)
    `,
  },
  {
    name: "기사 활동 거점 필드 일관성",
    why: "주소만 있고 좌표가 없거나 그 반대면 지도·목록 표시가 어긋납니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "mover_profiles"
       WHERE ("activity_base_address" IS NULL) <> ("activity_base_latitude" IS NULL)
    `,
  },
  {
    name: "나눔 자기 신청 금지",
    why: "작성자와 신청자는 달라야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "giveaway_requests" gr
        JOIN "giveaways" g ON g.id = gr.giveaway_id
       WHERE gr.requester_id = g.author_id
    `,
  },
  {
    name: "지정 기사의 서비스 유형 일치",
    why: "기사가 제공하지 않는 이사 유형은 지정할 수 없습니다 (DESIGNATION_SERVICE_TYPE_MISMATCH)",
    sql: `
      SELECT COUNT(*)::int AS n FROM "designated_movers" dm
        JOIN "estimate_requests" er ON er.id = dm."estimateRequestId"
        JOIN "mover_profiles" mp ON mp."userId" = dm."moverId"
       WHERE NOT EXISTS (
         SELECT 1 FROM "mover_service_types" mst
          WHERE mst."moverProfileId" = mp.id AND mst."moveType" = er."moveType"
       )
    `,
  },
  {
    name: "관리자 프로필 존재",
    why: "AdminProfile 이 없으면 authorizeAdmin 이 FORBIDDEN 을 던져 관리자 API 전체가 막힙니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "User" u
       WHERE u.role = 'ADMIN'
         AND NOT EXISTS (
           SELECT 1 FROM "admin_profiles" ap WHERE ap.user_id = u.id
         )
    `,
  },
  {
    name: "SUPER_ADMIN 정확히 1명",
    why: "0명이면 관리자 계정 관리가 불가능하고, 2명 이상이면 부트스트랩 정책과 어긋납니다",
    sql: `
      SELECT ABS(COUNT(*)::int - 1) AS n FROM "admin_profiles"
       WHERE admin_role = 'SUPER_ADMIN'
    `,
  },
  {
    name: "관리자 프로필의 User 역할",
    why: "AdminProfile 은 User.role = ADMIN 계정에만 붙어야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "admin_profiles" ap
        JOIN "User" u ON u.id = ap.user_id
       WHERE u.role <> 'ADMIN'
    `,
  },
  {
    name: "정지 계정과 이력 일관성",
    why: "isActive=false 인 계정은 마지막 이력이 SUSPEND 여야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "User" u
       WHERE u."isActive" = false
         AND u.role <> 'ADMIN'
         AND NOT EXISTS (
           SELECT 1 FROM "user_suspensions" s
            WHERE s.user_id = u.id AND s.action = 'SUSPEND'
         )
    `,
  },
  {
    name: "처리된 신고의 담당자",
    why: "RESOLVED/REJECTED 인데 처리자가 없으면 이력이 불완전합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "reports"
       WHERE status <> 'PENDING' AND (handled_by IS NULL OR handled_at IS NULL)
    `,
  },
  {
    name: "문의 lastMessageAt",
    why: "목록 정렬 기준이므로 실제 마지막 메시지와 같아야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "inquiries" i
        LEFT JOIN (
          SELECT inquiry_id, MAX(created_at) m FROM "inquiry_messages" GROUP BY inquiry_id
        ) s ON s.inquiry_id = i.id
       WHERE i.last_message_at IS DISTINCT FROM s.m
    `,
  },
  {
    name: "답변 완료 문의의 관리자 메시지",
    why: "ANSWERED/CLOSED 인데 관리자 답변이 없으면 상태가 거짓입니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "inquiries" i
       WHERE i.status IN ('ANSWERED', 'CLOSED')
         AND NOT EXISTS (
           SELECT 1 FROM "inquiry_messages" m WHERE m.inquiry_id = i.id AND m.is_admin = true
         )
    `,
  },
  {
    name: "약관 동의 누락",
    why: "필수 약관에 동의하지 않은 계정은 가입 자체가 불가능합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "User" u
       WHERE u.role IN ('CUSTOMER', 'MOVER')
         AND NOT EXISTS (
           SELECT 1 FROM "terms_agreements" ta WHERE ta.user_id = u.id
         )
    `,
  },
  {
    name: "type 당 게시 약관 1건",
    why: "같은 유형에 PUBLISHED 가 둘이면 어느 것을 보여줄지 결정할 수 없습니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM (
        SELECT type FROM "terms" WHERE status = 'PUBLISHED'
        GROUP BY type HAVING COUNT(*) > 1
      ) t
    `,
  },
  {
    name: "요청 생성 이력",
    why: "모든 요청에는 CREATED 이력이 있어야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "estimate_requests" er
       WHERE NOT EXISTS (
         SELECT 1 FROM "estimate_request_histories" h
          WHERE h."estimateRequestId" = er.id AND h.type = 'CREATED'
       )
    `,
  },
  {
    name: "프로필 이미지 키 규약",
    why: "완성 URL 을 넣으면 image-url.ts 의 바이패스 분기를 타 CloudFront 경로가 검증되지 않습니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM (
        SELECT "imageUrl" FROM "customer_profiles" WHERE "imageUrl" IS NOT NULL
        UNION ALL
        SELECT "imageUrl" FROM "mover_profiles" WHERE "imageUrl" IS NOT NULL
      ) t
       WHERE t."imageUrl" LIKE 'http%'
    `,
  },
  {
    name: "숨김 리뷰의 HIDE 로그",
    why: "관리자 숨김 처리에는 사유가 담긴 활동 로그가 남아야 합니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "reviews" r
       WHERE r.is_hidden = true
         AND NOT EXISTS (
           SELECT 1 FROM "activity_logs" al
            WHERE al.action = 'HIDE'
              AND al.target_type = 'REVIEW'
              AND al.target_id = r.id::text
         )
    `,
  },
  {
    name: "휴무일은 미래만",
    why: "과거 휴무일은 의미가 없고 캘린더 조회를 오염시킵니다",
    sql: `
      SELECT COUNT(*)::int AS n FROM "mover_unavailable_dates"
       WHERE date < CURRENT_DATE
    `,
  },
];

export async function verify(prisma: PrismaClient): Promise<boolean> {
  console.log("");
  console.log("🔍 정합성 검증");
  console.log("────────────────────────────────────────────────────");

  let failed = 0;

  for (const check of CHECKS) {
    const result = await prisma.$queryRawUnsafe<{ n: number }[]>(check.sql);
    const count = Number(result[0]?.n ?? 0);

    if (count === 0) {
      console.log(`  ✅ ${check.name}`);
      continue;
    }

    failed += 1;
    console.error(`  ❌ ${check.name} — 위반 ${count.toLocaleString("ko-KR")}건`);
    console.error(`     ${check.why}`);
  }

  console.log("────────────────────────────────────────────────────");

  if (failed === 0) {
    console.log(`🎉 ${CHECKS.length}개 검사 전부 통과`);

    return true;
  }

  console.error(`⚠️  ${failed}개 검사 실패 — 시드 데이터를 신뢰할 수 없습니다`);

  return false;
}

/** 적재 결과 요약 (검증과 별개로 눈으로 확인하기 위한 것) */
export async function printSummary(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ label: string; n: bigint }[]>(`
    SELECT '고객' AS label, COUNT(*) AS n FROM "User" WHERE role = 'CUSTOMER'
    UNION ALL SELECT '기사', COUNT(*) FROM "User" WHERE role = 'MOVER'
    UNION ALL SELECT '관리자', COUNT(*) FROM "User" WHERE role = 'ADMIN'
    UNION ALL SELECT '  └ 슈퍼', COUNT(*) FROM "admin_profiles" WHERE admin_role = 'SUPER_ADMIN'
    UNION ALL SELECT '견적요청', COUNT(*) FROM "estimate_requests"
    UNION ALL SELECT '  └ 완료', COUNT(*) FROM "estimate_requests" WHERE status = 'COMPLETED'
    UNION ALL SELECT '견적', COUNT(*) FROM "estimates"
    UNION ALL SELECT '리뷰', COUNT(*) FROM "reviews"
    UNION ALL SELECT '채팅방', COUNT(*) FROM "chat_rooms"
    UNION ALL SELECT '채팅메시지', COUNT(*) FROM "chat_messages"
    UNION ALL SELECT '찜', COUNT(*) FROM "favorite_movers"
    UNION ALL SELECT '거주후기', COUNT(*) FROM "residence_reviews"
    UNION ALL SELECT '나눔', COUNT(*) FROM "giveaways"
    UNION ALL SELECT '알림', COUNT(*) FROM "notifications"
    UNION ALL SELECT '약관동의', COUNT(*) FROM "terms_agreements"
    UNION ALL SELECT '요청이력', COUNT(*) FROM "estimate_request_histories"
    UNION ALL SELECT '신고', COUNT(*) FROM "reports"
    UNION ALL SELECT '문의', COUNT(*) FROM "inquiries"
    UNION ALL SELECT '활동로그', COUNT(*) FROM "activity_logs"
  `);

  console.log("");
  console.log("📦 적재 결과");
  console.log("────────────────────────────────────────────────────");

  for (const row of rows) {
    console.log(
      `  ${row.label.padEnd(12, " ")} ${Number(row.n).toLocaleString("ko-KR").padStart(12, " ")}`,
    );
  }

  console.log("────────────────────────────────────────────────────");
}
