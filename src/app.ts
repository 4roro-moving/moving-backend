import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import morganMiddleware from "./config/morgan";
import estimateRequestRouter from "./modules/estimate-request/estimateRequest.route";
import moverEstimateRequestRouter from "./modules/mover-estimate-request/mover-estimate-request.route";
import errorHandler from "./middlewares/errorHandler";
import notFoundHandler from "./middlewares/notFoundHandler";

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
app.use("/api/movers/estimate-requests", moverEstimateRequestRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
