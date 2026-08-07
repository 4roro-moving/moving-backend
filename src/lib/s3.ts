import { S3Client } from "@aws-sdk/client-s3";

const region = process.env.AWS_REGION;

if (!region) {
  throw new Error("AWS_REGION 환경변수가 설정되지 않았습니다.");
}

export const s3Client = new S3Client({
  region,
  requestChecksumCalculation: "WHEN_REQUIRED",
});
