import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import morganMiddleware from "./config/morgan";
import errorHandler from "./middlewares/errorHandler";
import notFoundHandler from "./middlewares/notFoundHandler";
import { authRouter } from "./modules/auth/auth.route";

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

/**
 * 실제 API 라우터는 이 위치에 연결
 */
app.use("/api/auth", authRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
