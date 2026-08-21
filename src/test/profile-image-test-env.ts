import "dotenv/config";

process.env.AWS_S3_BUCKET ??= "moving-backend-test-bucket";
process.env.AWS_REGION ??= "ap-northeast-2";
process.env.CLOUDFRONT_DOMAIN ??= "cdn.example.com";
