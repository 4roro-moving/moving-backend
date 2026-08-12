import { resolveMemberStatus } from "../member.policy";
import type { MoverListRow } from "./movers.repository";
import type { MoverListItem } from "./movers.type";

export function toMoverListItem(mover: MoverListRow): MoverListItem {
  const profile = mover.moverProfile;

  return {
    id: mover.id,
    email: mover.email,
    name: mover.name,
    nickname: profile?.nickname ?? null,
    career: profile?.career ?? 0,
    status: resolveMemberStatus(mover),
    isProfileCompleted: mover.isProfileCompleted,
    averageRating: Number(profile?.averageRating ?? 0),
    reviewCount: profile?.reviewCount ?? 0,
    confirmedCount: profile?.confirmedCount ?? 0,
    serviceAreas: profile?.serviceAreas.map((area) => area.region.name) ?? [],
    serviceTypes: profile?.serviceTypes.map((type) => type.moveType) ?? [],
    createdAt: mover.createdAt,
  };
}
