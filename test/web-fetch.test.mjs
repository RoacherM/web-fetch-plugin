import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, formatFetch } from '../index.js';

/** A ctx with just the services the plugin injects; `effect` runs the registration now. */
function fakeCtx(fetchImpl) {
  const tools = new Map();
  return {
    tools,
    ctx: { effect: (fn) => fn(), tools: { register: (t) => tools.set(t.name, t) }, web: { fetch: fetchImpl } },
  };
}

test('registers fetch_url, never the names Wow3 rejects', () => {
  const { ctx, tools } = fakeCtx(async () => {});
  apply(ctx);
  assert.deepEqual([...tools.keys()], ['fetch_url']);
});

test('execute fetches through ctx.web and marks the content untrusted', async () => {
  const seen = [];
  const { ctx, tools } = fakeCtx(async (req, signal) => {
    seen.push([req, signal]);
    return { url: 'https://example.com/', statusCode: 200, body: { kind: 'html', content: '# Example' }, truncated: false };
  });
  apply(ctx);
  const signal = new AbortController().signal;
  const value = await tools.get('fetch_url').execute({ url: 'https://example.com' }, { signal });
  assert.deepEqual(seen, [[{ url: 'https://example.com' }, signal]]);
  assert.match(value.text, /^External web content follows/);
  assert.match(value.text, /Status: 200/);
  assert.match(value.text, /# Example$/);
});

test('rejects a non-http URL before fetching', async () => {
  const { ctx, tools } = fakeCtx(async () => assert.fail('should not fetch'));
  apply(ctx);
  await assert.rejects(tools.get('fetch_url').execute({ url: 'file:///etc/passwd' }, {}), /http\(s\) URL/);
});

test('caps content at maxChars and says so', () => {
  const text = formatFetch({ url: 'u', statusCode: 200, body: { kind: 'text', content: 'abcdef' }, truncated: false }, 3);
  assert.match(text, /Truncated: content shown up to 3 characters/);
  assert.ok(text.endsWith('\n\nabc'));
});
