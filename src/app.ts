import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { apiReference } from "@scalar/express-api-reference";

import { env } from "./config/env";
import morganMiddleware from "./config/morgan";
import { generateOpenApiDocument } from "./config/openapi";

import errorHandler from "./middlewares/error-handler";
import notFoundHandler from "./middlewares/not-found-handler";

import { adminReviewRouter } from "./modules/admin/contents/contents.route";
import adminEstimateRouter from "./modules/admin/estimates/estimates.route";
import adminCustomerRouter from "./modules/admin/member-management/customers/customers.route";
import noticeRouter from "./modules/admin/notice/notice.route";
import { authRouter } from "./modules/auth/auth.route";
import { chatRouter } from "./modules/chat/chat.route";
import estimateRequestRouter from "./modules/estimate-request/estimateRequest.route";
import estimateRouter from "./modules/estimate/estimate.route";
import favoriteRouter from "./modules/favorite/favorite.route";
import moverRouter from "./modules/mover/mover.route";
import { moverCalendarRouter } from "./modules/mover-calendar/mover-calendar.route";
import { notificationRouter } from "./modules/notification/notification.route";
import notificationSseRouter from "./modules/notification/notification-sse.route";
import { profileRouter } from "./modules/profile/profile.route";
import reportRouter from "./modules/report/report.route";
import reviewRouter from "./modules/review/review.route";

import { adminFaqRouter, publicFaqRouter } from "./modules/admin/faq/faq.route";
import { adminInquiryRouter, inquiryRouter } from "./modules/inquiry/inquiry.route";
import { adminAuthRouter } from "./modules/admin/auth/admin-auth.route";
import { adminTermsRouter, publicTermsRouter } from "./modules/terms/terms.route";

// Swagger UI로 전환할 때 사용
// import type { RequestHandler } from "express";
// import swaggerUi from "swagger-ui-express";

const app = express();

/*
 * Nginx 1단계 Reverse Proxy를 신뢰한다.
 *
 * Nginx가 전달하는 X-Forwarded-For를 기반으로
 * Express의 req.ip가 실제 클라이언트 IP를 사용하도록 한다.
 */
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
        "style-src": ["'self'", "https:", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],
        "worker-src": ["'self'", "blob:"],
      },
    },
  }),
);

/*
 * 프론트엔드와 쿠키를 주고받기 위해
 * credentials 옵션을 활성화한다.
 */
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);
/*
 * 일반 응답에는 압축을 적용한다.
 *
 * SSE 응답은 연결을 유지한 채 이벤트를 즉시 전송해야 하므로
 * compression 적용 대상에서 제외한다.
 *
 * compression이 SSE 응답을 버퍼링하면
 * 이벤트가 클라이언트에 바로 전달되지 않을 수 있다.
 */
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.startsWith("/api/notifications/sse")) {
        return false;
      }

      return compression.filter(req, res);
    },
  }),
);

/*
 * 일반 쿠키와 서명된 쿠키를 파싱한다.
 *
 * Refresh Token은 서명하지 않은 HttpOnly Cookie이므로
 * req.cookies에서 조회한다.
 *
 * Naver OAuth state는 signed Cookie이므로
 * req.signedCookies에서 조회한다.
 */
app.use(cookieParser(env.OAUTH_STATE_SECRET));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(morganMiddleware);

/*
 * 서버 상태 확인
 */
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Moving API server is running.",
  });
});

/*
 * OpenAPI 문서
 *
 * GET /openapi.json
 */
app.get("/openapi.json", (_req, res, next) => {
  generateOpenApiDocument()
    .then((document) => {
      res.status(200).json(document);
    })
    .catch(next);
});

/*
 * Scalar API Reference
 *
 * GET /docs
 */
app.use(
  "/docs",
  apiReference({
    url: "/openapi.json",
    theme: "purple",
    pageTitle: "Moving API",
  }),
);

// Swagger UI로 전환할 때 사용
// const swaggerHandler: RequestHandler = (req, res, next) => {
//   generateOpenApiDocument()
//     .then((document) => {
//       swaggerUi.setup(document)(req, res, next);
//     })
//     .catch(next);
// };
//
// app.use("/docs", swaggerUi.serve, swaggerHandler);

/*
 * API Router
 */
app.use("/api/auth", authRouter);
app.use("/api/profiles", profileRouter);
app.use("/api/estimate-requests", estimateRequestRouter);
app.use("/api/movers", moverRouter);
app.use("/api/movers", moverCalendarRouter);
app.use("/api/estimates", estimateRouter);
app.use("/api/reviews", reviewRouter);
app.use("/api/reports", reportRouter);
app.use("/api/favorites", favoriteRouter);
app.use("/api/chats", chatRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/notifications/sse", notificationSseRouter);
app.use("/api/terms", publicTermsRouter);

/*
 * 관리자 API
 */
app.use("/api/admin/auth", adminAuthRouter);
app.use("/api/admin/notices", noticeRouter);
app.use("/api/admin/reviews", adminReviewRouter);
app.use("/api/admin/estimates", adminEstimateRouter);
app.use("/api/admin/users", adminCustomerRouter); // 관리자 고객(회원) 라우터
app.use("/api/admin/faqs", adminFaqRouter); //  관리자 FAQ 라우터
app.use("/api/faqs", publicFaqRouter); // 일반 사용자 FAQ 라우터
app.use("/api/inquiries", inquiryRouter); // 사용자 1:1 문의 라우터
app.use("/api/admin/inquiries", adminInquiryRouter); // 관리자 1:1 문의 라우터
app.use("/api/admin/terms", adminTermsRouter); // 관리자 약관 라우터

/*
 * 존재하지 않는 경로 처리
 */
app.use(notFoundHandler);

/*
 * 전역 에러 처리
 */
app.use(errorHandler);

export default app;
