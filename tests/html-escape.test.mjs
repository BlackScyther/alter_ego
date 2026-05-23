import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/shared/escape-html.js';
import { INJECTION_PAYLOADS } from './helpers/test-server.mjs';

describe('escapeHtml', () => {
  it('escapes ampersands and angle brackets', () => {
    assert.equal(escapeHtml('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
  });

  it('escapes quotes for attribute safety', () => {
    assert.equal(escapeHtml('" onclick="alert(1)'), '&quot; onclick=&quot;alert(1)');
    assert.equal(escapeHtml("' OR '1'='1"), '&#39; OR &#39;1&#39;=&#39;1');
  });

  it('neutralizes common XSS payloads', () => {
    for (const payload of [
      INJECTION_PAYLOADS.xssScript,
      INJECTION_PAYLOADS.xssImg,
      INJECTION_PAYLOADS.xssQuote
    ]) {
      const escaped = escapeHtml(payload);
      assert.doesNotMatch(escaped, /<(script|img|svg)/i);
      assert.match(escaped, /&lt;/);
    }
  });

  it('handles null and undefined', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });
});

describe('GM card HTML simulation', () => {
  it('does not embed raw script tags in card markup', () => {
    const id = {
      characterName: INJECTION_PAYLOADS.xssScript,
      level: 1,
      race: INJECTION_PAYLOADS.xssImg,
      class: 'Fighter',
      playerName: INJECTION_PAYLOADS.xssQuote
    };
    const file = `${INJECTION_PAYLOADS.pathTraversal}.json`;

    const html = `
      <h3>${escapeHtml(id.characterName || 'Unnamed')}</h3>
      <p>Level ${id.level} · ${escapeHtml(id.race || '—')} ${id.class ? `/ ${escapeHtml(id.class)}` : ''}</p>
      <p>Player: ${escapeHtml(id.playerName || '—')}</p>
      <p>${escapeHtml(file)}</p>`;

    assert.doesNotMatch(html, /<(script|img|svg)/i);
    assert.match(html, /&lt;script&gt;/);
  });
});
