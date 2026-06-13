import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/character/model.js';
import {
  canLevelUp,
  levelUpTooltip,
  retrainingBuilderStart,
  xpRequiredForNextLevel
} from '../src/editor/post-load.js';

test('xpRequiredForNextLevel returns threshold for next level', () => {
  assert.equal(xpRequiredForNextLevel(1), 1000);
  assert.equal(xpRequiredForNextLevel(5), 7500);
  assert.equal(xpRequiredForNextLevel(30), null);
});

test('canLevelUp requires sheet XP for the next level', () => {
  const character = createCharacter();
  character.identity.level = 5;
  character.identity.totalXp = 7499;
  assert.equal(canLevelUp(character), false);

  character.identity.totalXp = 7500;
  assert.equal(canLevelUp(character), true);
});

test('canLevelUp is false at level 30', () => {
  const character = createCharacter();
  character.identity.level = 30;
  character.identity.totalXp = 1_000_000;
  assert.equal(canLevelUp(character), false);
});

test('levelUpTooltip explains missing XP', () => {
  const character = createCharacter();
  character.identity.level = 2;
  character.identity.totalXp = 500;
  assert.match(levelUpTooltip(character), /2,250 XP/);
  assert.match(levelUpTooltip(character), /currently 500/);
});

test('levelUpTooltip is empty when leveling is allowed', () => {
  const character = createCharacter();
  character.identity.level = 2;
  character.identity.totalXp = 2250;
  assert.equal(levelUpTooltip(character), '');
});

test('retrainingBuilderStart opens builder flow at powers', () => {
  const flow = ['basics', 'race', 'background', 'class', 'abilities', 'powers', 'feats', 'review'];
  const { completedSteps, startStepIndex } = retrainingBuilderStart(flow);
  assert.deepEqual(completedSteps, ['basics', 'race', 'background', 'class', 'abilities']);
  assert.equal(startStepIndex, flow.indexOf('powers'));
});
