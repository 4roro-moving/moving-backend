-- AlterTable
ALTER TABLE "regions"
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;

-- 위도, 경도 컬럼 추가로, 마이그레이션 과정에서 기존 지역 행에 정해진 대표 좌표를 넣는 파일입니다.
UPDATE "regions"
SET
  "latitude" = CASE "name"
    WHEN '서울' THEN 37.5665
    WHEN '부산' THEN 35.1796
    WHEN '대구' THEN 35.8714
    WHEN '인천' THEN 37.4563
    WHEN '광주' THEN 35.1595
    WHEN '대전' THEN 36.3504
    WHEN '울산' THEN 35.5395
    WHEN '세종' THEN 36.4800
    WHEN '경기' THEN 37.2636
    WHEN '강원' THEN 37.8854
    WHEN '충북' THEN 36.6424
    WHEN '충남' THEN 36.6012
    WHEN '전북' THEN 35.8202
    WHEN '전남' THEN 34.8161
    WHEN '경북' THEN 36.5760
    WHEN '경남' THEN 35.2383
    WHEN '제주' THEN 33.4996
  END,
  "longitude" = CASE "name"
    WHEN '서울' THEN 126.9780
    WHEN '부산' THEN 129.0756
    WHEN '대구' THEN 128.6014
    WHEN '인천' THEN 126.7052
    WHEN '광주' THEN 126.8526
    WHEN '대전' THEN 127.3845
    WHEN '울산' THEN 129.3114
    WHEN '세종' THEN 127.2890
    WHEN '경기' THEN 127.0286
    WHEN '강원' THEN 127.7298
    WHEN '충북' THEN 127.4890
    WHEN '충남' THEN 126.6608
    WHEN '전북' THEN 127.1089
    WHEN '전남' THEN 126.4629
    WHEN '경북' THEN 128.5056
    WHEN '경남' THEN 128.6924
    WHEN '제주' THEN 126.5312
  END;

ALTER TABLE "regions"
ALTER COLUMN "latitude" SET NOT NULL,
ALTER COLUMN "longitude" SET NOT NULL;
