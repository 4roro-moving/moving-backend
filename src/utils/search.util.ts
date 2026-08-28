/**
 * Prisma contains/startsWith/endsWith 는 PostgreSQL LIKE/ILIKE 로 변환되므로
 * %, _, \ 는 리터럴 검색을 위해 이스케이프가 필요합니다.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
