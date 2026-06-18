import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoPointBuy,
  pointBuySpent,
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
