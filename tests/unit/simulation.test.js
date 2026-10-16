import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCloseSettlement,
  calculateCompetitionReturn,
  calculateSimulatedFee,
  calculateSimulatedPnl,
  marketDataIsFresh,
  validateTCAllocation
} from '../../src/domain/simulation.js';

test('TC allocation validation rejects zero, invalid and over-balance orders', () => {
  assert.equal(validateTCAllocation('0', 100).reason, 'invalid-amount');
  assert.equal(validateTCAllocation('abc', 100).reason, 'invalid-amount');
  assert.equal(validateTCAllocation('101', 100).reason, 'insufficient-tc');
  assert.deepEqual(validateTCAllocation('25.25', 100), {
    valid: true, amount: 25.25, reason: null
  });
});

test('simulated P&L is directional and rounded to two TC decimals', () => {
  assert.equal(calculateSimulatedPnl({
    allocation: 100, entryPrice: 100, markPrice: 110, direction: 'Long'
  }), 10);
  assert.equal(calculateSimulatedPnl({
    allocation: 100, entryPrice: 100, markPrice: 110, direction: 'Short'
  }), -10);
  assert.equal(calculateSimulatedPnl({
    allocation: 100, entryPrice: 3, markPrice: 3.1, direction: 'Long'
  }), 3.33);
});

test('closing a simulated position never returns a negative TC balance', () => {
  assert.deepEqual(calculateCloseSettlement(100, -30), {
    tcReturned: 70, realizedPnl: -30
  });
  assert.deepEqual(calculateCloseSettlement(100, -130), {
    tcReturned: 0, realizedPnl: -130
  });
});

test('simulated fee calculation handles ordinary and invalid values', () => {
  assert.equal(calculateSimulatedFee(1000, 0.0005), 0.5);
  assert.equal(calculateSimulatedFee(-1, 0.0005), 0);
  assert.equal(calculateSimulatedFee(1000, -0.1), 0);
});

test('competition return uses frozen starting equity and rejects invalid denominator', () => {
  assert.equal(calculateCompetitionReturn(1000, 1125), 12.5);
  assert.equal(calculateCompetitionReturn(1000, 900), -10);
  assert.equal(calculateCompetitionReturn(0, 900), null);
});

test('market data is fresh only within the configured non-negative age window', () => {
  assert.equal(marketDataIsFresh(10000, 12000), true);
  assert.equal(marketDataIsFresh(10000, 13001), false);
  assert.equal(marketDataIsFresh(13000, 12000), false);
  assert.equal(marketDataIsFresh(NaN, 12000), false);
});
