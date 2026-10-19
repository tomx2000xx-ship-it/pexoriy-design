import test from "node:test";
import assert from "node:assert/strict";
import { calculateMissionCurrentDay, MISSION_JOURNEY_LENGTH } from "../../worker/mission-journey.js";

test("every member starts on Day 1 on their own signup date", () => {
  assert.equal(calculateMissionCurrentDay("2026-10-20T08:00:00.000Z", new Date("2026-10-20T22:30:00.000Z")), 1);
});

test("the same 30-day sequence unlocks one day at a time from the member's start date", () => {
  assert.equal(calculateMissionCurrentDay("2026-10-01T18:00:00.000Z", new Date("2026-10-02T00:10:00.000Z")), 2);
  assert.equal(calculateMissionCurrentDay("2026-10-01T18:00:00.000Z", new Date("2026-10-30T18:00:00.000Z")), 30);
  assert.equal(MISSION_JOURNEY_LENGTH, 30);
});

test("the journey never unlocks more than 30 days and does not start in the future", () => {
  assert.equal(calculateMissionCurrentDay("2026-10-01T18:00:00.000Z", new Date("2027-01-01T00:00:00.000Z")), 30);
  assert.equal(calculateMissionCurrentDay("2026-10-21T18:00:00.000Z", new Date("2026-10-20T12:00:00.000Z")), 1);
});

test("invalid timestamps fail safely to Day 1", () => {
  assert.equal(calculateMissionCurrentDay("not-a-date", new Date("2026-10-20T12:00:00.000Z")), 1);
});
