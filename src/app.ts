import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { apiReference } from "@scalar/express-api-reference";

import morganMiddleware from "./config/morgan";

import { authRouter } from "./modules/auth/auth.route";
import errorHandler from "./middlewares/error-handler";
import notFoundHandler from "./middlewares/not-found-handler";
import { generateOpenApiDocument } from "./config/openapi";
import estimateRequestRouter from "./modules/estimate-request/estimateRequest.route";
import moverRouter from "./modules/mover/mover.route";

// 스웨거용
// import type { RequestHandler } from "express";
// import swaggerUi from "swagger-ui-express";
import moverEstimateRequestRouter from "./modules/estimate/estimate.route";
import reviewRouter from "./modules/review/review.route";
import favoriteRouter from "./modules/favorite/favorite.route";

const app = express();

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

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);

app.use(compression());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morganMiddleware);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Moving API server is running.",
  });
});

/**
 * API 문서
 * - /openapi.json : OpenAPI 3.1 문서
 * - /docs         : Scalar API Reference 화면
 */
app.get("/openapi.json", (_req, res, next) => {
  generateOpenApiDocument()
    .then((document) => {
      res.status(200).json(document);
    })
    .catch(next);
});

app.use(
  "/docs",
  apiReference({
    url: "/openapi.json",
    theme: "purple",
    pageTitle: "Moving API",
  }),
);

// 스웨거로 볼 때 전환용
// const swaggerHandler: RequestHandler = (req, res, next) => {
//   generateOpenApiDocument()
//     .then((document) => {
//       swaggerUi.setup(document)(req, res, next);
//     })
//     .catch(next);
// };

// app.use("/docs", swaggerUi.serve, swaggerHandler);

app.use("/api/auth", authRouter);

app.use("/api/estimate-requests", estimateRequestRouter);
app.use("/api/movers", moverRouter);
app.use("/api/estimates", moverEstimateRequestRouter);
app.use("/api/reviews", reviewRouter);
app.use("/api/favorites", favoriteRouter);

// 존재하지 않는 경로 처리
app.use(notFoundHandler);

// 전역 에러 처리
app.use(errorHandler);

export default app;
