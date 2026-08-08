import { S3Client } from "@aws-sdk/client-s3";

import { AppError } from "./app-error";

const region = process.env.AWS_REGION;

if (!region) {
  throw new AppError("INTERNAL_SERVER_ERROR", {
    message: "AWS_REGION 환경변수가 설정되지 않았습니다.",
  });
}

export const s3Client = new S3Client({
  region,
});
