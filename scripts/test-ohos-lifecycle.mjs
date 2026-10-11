import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

const source = await readFile(new URL('../ohos/entry/src/main/ets/managers/VpnLifecycle.ets', import.meta.url), 'utf8');
const javascript = stripTypeScriptTypes(source);
const { VpnLifecycle } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('only reports running after resources have been acquired', async () => {
  const created = deferred();
  const entered = deferred();
  const lifecycle = new VpnLifecycle(async () => {});
  const start = lifecycle.start(async () => { entered.resolve(); await created.promise; }, 123);
  await entered.promise;
  assert.equal(lifecycle.runTime, 0);
  created.resolve();
  assert.equal(await start, 123);
  assert.equal(lifecycle.runTime, 123);
});

test('failed startup releases resources and allows a successful retry', async () => {
  let released = 0;
  const failure = new Error('system VPN creation failed');
  const lifecycle = new VpnLifecycle(async () => { released++; });
  await assert.rejects(lifecycle.start(async () => { throw failure; }, 123), error => error === failure);
  assert.equal(lifecycle.runTime, 0);
  assert.equal(released, 1);
  assert.equal(await lifecycle.start(async () => {}, 456), 456);
});

test('stop cancels a pending create and waits for its resources to be released', async () => {
  const created = deferred();
  const entered = deferred();
  const released = deferred();
  let tunStarted = false;
  let stopCompleted = false;
  const lifecycle = new VpnLifecycle(async () => { await released.promise; });
  const start = lifecycle.start(async isCancelled => {
    entered.resolve();
    await created.promise;
    if (!isCancelled()) tunStarted = true;
  }, 123);
  await entered.promise;
  const stop = lifecycle.stop().then(() => { stopCompleted = true; });
  created.resolve();
  await Promise.resolve();
  assert.equal(stopCompleted, false);
  released.resolve();
  assert.equal(await start, 0);
  await stop;
  assert.equal(tunStarted, false);
  assert.equal(lifecycle.runTime, 0);
});

test('a new start waits for the old start and stop to finish', async () => {
  const created = deferred();
  const entered = deferred();
  const events = [];
  const lifecycle = new VpnLifecycle(async () => { events.push('release'); });
  const first = lifecycle.start(async () => { entered.resolve(); await created.promise; events.push('old-created'); }, 123);
  await entered.promise;
  const stop = lifecycle.stop();
  const second = lifecycle.start(async () => { events.push('new-created'); }, 456);
  created.resolve();
  assert.equal(await first, 0);
  await stop;
  assert.equal(await second, 456);
  assert.ok(events.indexOf('old-created') < events.indexOf('new-created'));
  assert.ok(events.indexOf('release') < events.indexOf('new-created'));
  assert.equal(lifecycle.runTime, 456);
});

test('stop errors are reported without claiming the running VPN has stopped', async () => {
  let failStop = true;
  const lifecycle = new VpnLifecycle(async () => { if (failStop) throw new Error('destroy failed'); });
  await lifecycle.start(async () => {}, 123);
  await assert.rejects(lifecycle.stop(), /destroy failed/);
  assert.equal(lifecycle.runTime, 123);
  failStop = false;
  await lifecycle.stop();
  assert.equal(lifecycle.runTime, 0);
});
