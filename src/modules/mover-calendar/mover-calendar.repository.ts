import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import type { DbClient } from "../../utils/transaction";

export const moverCalendarRepository = {
  //기사 계정 조회
  findActiveMover(moverId: string) {
    return prisma.user.findFirst({
      where: {
        id: moverId,
        role: "MOVER",
        isActive: true,
        deletedAt: null,
        moverProfile: { isNot: null },
      },
      select: { id: true },
    });
  },

  //월별 휴무일 조회
  //기사 아이디 일치 && start 이상 && end 미만
  findUnavailableDates(moverId: string, start: Date, end: Date) {
    return prisma.moverUnavailableDate.findMany({
      where: { moverId, date: { gte: start, lt: end } },
      select: { date: true },
      orderBy: { date: "asc" },
    });
  },

  //특정 휴무일 조회
  //moverId_date 는 기사ID와 date의 유니크 조회 키 = 이 기사가 해당 날짜에 휴무인지 확인
  findUnavailableDate(moverId: string, date: Date, db: DbClient = prisma) {
    return db.moverUnavailableDate.findUnique({
      where: { moverId_date: { moverId, date } },
      select: { id: true },
    });
  },

  //확정 일정 조회
  findConfirmedMoves(moverId: string, start: Date, end: Date) {
    return prisma.estimate.findMany({
      where: {
        moverId,
        status: "CONFIRMED",
        estimateRequest: {
          status: { in: ["CONFIRMED", "COMPLETED"] },
          moveDate: { gte: start, lt: end },
        },
      },
      select: {
        id: true,
        estimateRequest: {
          select: {
            id: true,
            moveDate: true,
            moveType: true,
            customer: { select: { name: true } },
          },
        },
      },
    });
  },

  //휴무 등록
  //upsert는 데이터가 없으면 생성하고 데이터가 있으면 수정함 - 이미 휴무라면 아무것도 바꾸지 않음
  upsertUnavailableDate(moverId: string, date: Date, db: DbClient = prisma) {
    return db.moverUnavailableDate.upsert({
      where: { moverId_date: { moverId, date } },
      create: { moverId, date },
      update: {},
      select: { date: true },
    });
  },

  //휴무 해제
  //deleteMany는 데이터가 없어도 오류 나지 않게 하기 위해
  deleteUnavailableDate(moverId: string, date: Date, db: DbClient = prisma) {
    return db.moverUnavailableDate.deleteMany({ where: { moverId, date } });
  },

  //특정 날짜의 확정 일정 개수
  countConfirmedMoves(moverId: string, date: Date, db: DbClient = prisma) {
    //하루 범위 조회
    const nextDate = new Date(date);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    return db.estimate.count({
      where: {
        moverId,
        status: "CONFIRMED",
        estimateRequest: {
          status: { in: ["CONFIRMED", "COMPLETED"] },
          moveDate: { gte: date, lt: nextDate },
        },
      },
    });
  },

  //동일 기사/ 동일 날짜에 들어오는 동시 요청을 순서대로 처리하기 위한 PostgreSQL 잠금
  lockMoverDate(moverId: string, date: Date, db: DbClient) {
    const key = `${moverId}:${date.toISOString().slice(0, 10)}`;
    // pg_advisory_xact_lock returns PostgreSQL's `void` type, which Prisma cannot
    // deserialize through $queryRaw. The lock's result is not needed; its effect
    // is held for the surrounding transaction, so execute it as a command instead.
    return db.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  },
};
