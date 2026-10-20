import test from "node:test";
import assert from "node:assert/strict";
import { calculateReferralPoolAwards, getReferralPoolWindow } from "../../worker/referral-pool.js";

test("referral pool cycles use Monday 00:00 UTC through the next Monday", () => {
  assert.deepEqual(getReferralPoolWindow(new Date("2026-10-20T07:00:00.000Z")), {
    periodStart: "2026-10-19T00:00:00.000Z",
    periodEnd: "2026-10-26T00:00:00.000Z",
  });
  assert.deepEqual(getReferralPoolWindow(new Date("2026-10-25T23:59:59.000Z")), {
    periodStart: "2026-10-19T00:00:00.000Z",
    periodEnd: "2026-10-26T00:00:00.000Z",
  });
});

test("shared-pool awards are proportional to verified activations", () => {
  const result = calculateReferralPoolAwards([
    { userId: "referrer-b", activations: 3 },
    { userId: "referrer-a", activations: 1 },
  ], 4000, 4000);
  assert.equal(result.totalActivations, 4);
  assert.deepEqual(result.awards, [
    { userId: "referrer-a", activations: 1, rewardTC: 1000 },
    { userId: "referrer-b", activations: 3, rewardTC: 3000 },
  ]);
});

test("per-user caps prevent a large referrer from taking the entire pool", () => {
  const result = calculateReferralPoolAwards([
    { userId: "referrer-a", activations: 30 },
    { userId: "referrer-b", activations: 1 },
    { userId: "referrer-c", activations: 1 },
  ], 10000, 1000);
  assert.deepEqual(result.awards.map(award => award.rewardTC), [1000, 312, 312]);
  assert.ok(result.awards.reduce((sum, award) => sum + award.rewardTC, 0) <= 10000);
});

test("no verified activations produce no awards", () => {
  assert.deepEqual(calculateReferralPoolAwards([], 10000, 1000), { totalActivations: 0, awards: [] });
});

test("invalid activation rows and caps are rejected", () => {
  assert.throws(() => calculateReferralPoolAwards([{ userId: "referrer-a", activations: 0 }]), /positive safe integers/);
  assert.throws(() => calculateReferralPoolAwards([{ userId: "", activations: 1 }]), /user id/);
  assert.throws(() => calculateReferralPoolAwards([], 10000, 10001), /per-user cap/);
});
