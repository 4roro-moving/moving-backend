import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import morganMiddleware from "./config/morgan";
import errorHandler from "./middlewares/error-handler";
import notFoundHandler from "./middlewares/not-found-handler";
import estimateRequestRouter from "./modules/estimate-request/estimateRequest.route";

const app = express();

app.use(helmet());

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

app.use("/api/estimate-requests", estimateRequestRouter);

// 존재하지 않는 경로 처리
app.use(notFoundHandler);

// 전역 에러 처리
app.use(errorHandler);

export default app;
