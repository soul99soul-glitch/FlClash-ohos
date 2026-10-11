import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

const source = await readFile(new URL('../ohos/entry/src/main/ets/managers/PowerManager.ets', import.meta.url), 'utf8');

async function createPowerManager() {
  const subscriber = {};
  const callbacks = [];
  const commonEventManager = {
    Support: { COMMON_EVENT_DEVICE_IDLE_MODE_CHANGED: 'idle' },
    createSubscriberSync: () => subscriber,
    unsubscribe: (actualSubscriber, callback) => {
      assert.equal(actualSubscriber, subscriber);
      callbacks.push(callback);
    },
  };
  const context = createContext({ console });
  const module = new SourceTextModule(stripTypeScriptTypes(source), { context });
  await module.link(specifier => {
    assert.equal(specifier, '@kit.BasicServicesKit');
    return new SyntheticModule(['commonEventManager'], function () {
      this.setExport('commonEventManager', commonEventManager);
    }, { context });
  });
  await module.evaluate();
  return { manager: new module.namespace.default(), callbacks };
}

test('power listener cleanup waits for the system unsubscribe callback', async () => {
  const { manager, callbacks } = await createPowerManager();
  let completed = false;
  const stopped = manager.unsubscribe().then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(typeof callbacks[0], 'function');
  callbacks[0](undefined);
  await stopped;
  assert.equal(completed, true);
});

test('power listener cleanup reports the system error', async () => {
  const { manager, callbacks } = await createPowerManager();
  const stopped = manager.unsubscribe();
  assert.equal(typeof callbacks[0], 'function');
  const failure = new Error('unsubscribe failed');
  callbacks[0](failure);
  await assert.rejects(stopped, error => error === failure);
});
