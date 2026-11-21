/** Utilitaires de dates « locales » à partir du décalage horaire du client (Date.getTimezoneOffset, en minutes). */
export function clampTz(tz: unknown): number {
  const n = Number(tz);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-14 * 60, Math.min(14 * 60, Math.round(n)));
}

/** Fin de la journée locale (instant UTC). */
export function endOfLocalDay(now: Date, tz: number): Date {
  const local = new Date(now.getTime() - tz * 60_000);
  local.setUTCHours(24, 0, 0, 0);
  return new Date(local.getTime() + tz * 60_000);
}

export function localDateKey(d: Date, tz: number): string {
  return new Date(d.getTime() - tz * 60_000).toISOString().slice(0, 10);
}

/** Modificateur SQLite pour convertir un horodatage UTC en date locale. */
export function sqlTzModifier(tz: number): string {
  return `${-tz >= 0 ? '+' : ''}${-tz} minutes`;
}

/** Série de jours consécutifs avec activité, en partant d'aujourd'hui (ou d'hier si rien aujourd'hui). */
export function computeStreak(activeDays: Set<string>, today: string): number {
  const d = new Date(`${today}T00:00:00Z`);
  if (!activeDays.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  let streak = 0;
  while (activeDays.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}
