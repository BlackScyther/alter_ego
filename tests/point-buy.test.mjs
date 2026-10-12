import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoPointBuy,
  pointBuySpent,
  pointBuyIssues,
  countScoresBelowTen,
  POINT_BUY_ABILITIES
} from '../src/character/model.js';

test('autoPointBuy stays within the 22-point budget', () => {
  const scores = autoPointBuy(['str', 'con']);
  const { remaining } = pointBuySpent(scores);
  assert.ok(remaining >= 0, `expected within budget, remaining=${remaining}`);
  for (const k of POINT_BUY_ABILITIES) {
    assert.ok(scores[k] >= 8 && scores[k] <= 18, `${k}=${scores[k]} out of 8-18`);
  }
});

test('autoPointBuy favors the priority abilities first', () => {
  const scores = autoPointBuy(['int', 'con']);
  assert.ok(scores.int >= scores.str, 'primary INT should be >= non-primary STR');
  assert.ok(scores.int >= scores.dex, 'primary INT should be >= non-primary DEX');
});

test('autoPointBuy never produces more than one sub-10 score', () => {
  const scores = autoPointBuy(['cha']);
  assert.ok(countScoresBelowTen(scores) <= 1);
});

test('autoPointBuy ignores unknown priority keys and falls back gracefully', () => {
  const scores = autoPointBuy(['bogus', 'wis']);
  const { remaining } = pointBuySpent(scores);
  assert.ok(remaining >= 0);
  assert.ok(scores.wis >= 10);
});

test('autoPointBuy default priority is deterministic', () => {
  assert.deepEqual(autoPointBuy(), autoPointBuy(['str', 'con']));
});

test('point-buy is ready when every score is in range and within budget', () => {
  const scores = { str: 18, con: 11, dex: 10, int: 14, wis: 10, cha: 8 };
  assert.deepEqual(pointBuyIssues(scores), []);
});

test('point-buy blocks a second score below 10 and scores outside 8–18', () => {
  const twoLow = { str: 8, con: 8, dex: 10, int: 10, wis: 10, cha: 10 };
  assert.ok(pointBuyIssues(twoLow).some((msg) => msg.includes('below 10')));
  const high = { str: 19, con: 10, dex: 10, int: 10, wis: 10, cha: 10 };
  assert.ok(pointBuyIssues(high).some((msg) => msg.includes('8–18')));
});
