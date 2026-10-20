export function getReferralPoolWindow(now = new Date()) {
  const instant = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new TypeError("A valid cycle timestamp is required.");
  const start = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

export function calculateReferralPoolAwards(activationRows, poolTC = 10000, maxAwardPerUserTC = 1000) {
  if (!Array.isArray(activationRows)) throw new TypeError("Verified activation rows are required.");
  if (!Number.isSafeInteger(poolTC) || poolTC < 1) throw new TypeError("Pool TC must be a positive safe integer.");
  if (!Number.isSafeInteger(maxAwardPerUserTC) || maxAwardPerUserTC < 1 || maxAwardPerUserTC > poolTC) {
    throw new TypeError("The per-user cap must be between 1 and the pool size.");
  }
  const rows = activationRows.map((row) => {
    if (!row || typeof row.userId !== "string" || !row.userId.trim()) throw new TypeError("Each award requires a referrer user id.");
    if (!Number.isSafeInteger(row.activations) || row.activations < 1) throw new TypeError("Verified activations must be positive safe integers.");
    return { userId: row.userId, activations: row.activations };
  });
  const totalActivations = rows.reduce((sum, row) => sum + row.activations, 0);
  if (!Number.isSafeInteger(totalActivations)) throw new TypeError("Total verified activations exceed the safe integer range.");
  if (totalActivations === 0) return { totalActivations: 0, awards: [] };
  const awards = rows
    .map((row) => ({
      userId: row.userId,
      activations: row.activations,
      rewardTC: Math.min(maxAwardPerUserTC, Math.floor((poolTC * row.activations) / totalActivations)),
    }))
    .filter((award) => award.rewardTC > 0)
    .sort((a, b) => a.userId.localeCompare(b.userId));
  if (awards.reduce((sum, award) => sum + award.rewardTC, 0) > poolTC) {
    throw new Error("Referral pool allocation exceeded its cycle cap.");
  }
  return { totalActivations, awards };
}
