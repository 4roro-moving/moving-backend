const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getKstEndOfDay(date: Date): Date {
  const kstDate = new Date(date.getTime() + KST_OFFSET_MS);

  return new Date(
    Date.UTC(
      kstDate.getUTCFullYear(),
      kstDate.getUTCMonth(),
      kstDate.getUTCDate(),
      14,
      59,
      59,
      999,
    ),
  );
}
