import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

const source = await readFile(new URL('../ohos/entry/src/main/ets/plugins/ServicePlugin.ets', import.meta.url), 'utf8');

async function createService() {
  const state = { runTime: 0, runState: 2, state: { vpnOptions: {} } };
  const parent = {
    handleInit: async () => {},
    handleShutdown: async () => {},
    handleStartService: async (_options, _time, stub) => { parent.start = stub; },
    handleStopService: async stub => { parent.stop = stub; },
    setOnDisconnected: callback => { parent.disconnect = callback; },
  };
  class ResultStub {
    constructor(_name, callback) { this.complete = callback; }
  }
  const context = createContext({ console });
  const imports = {
    '@ohos/flutter_ohos': { FlutterPlugin: class {}, FlutterPluginBinding: class {}, MethodCall: class {}, MethodCallHandler: class {}, MethodChannel: class {}, MethodResult: class {} },
    '../entryability/EntryAbility': { default: class {}, CallbackStub: class {}, ResultStub },
    '../models/State': { State: class {}, VpnOptions: class {} },
    '../utils/Event': { publishEvent: () => {} },
    '../GlobalState': { globalState: state, RunState: { start: 0, pending: 1, stop: 2 } },
  };
  const module = new SourceTextModule(stripTypeScriptTypes(source), { context });
  await module.link(specifier => {
    const exports = imports[specifier];
    assert.ok(exports, `Unexpected production dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  return { service: new module.namespace.default(parent), parent, state };
}

function result() {
  const calls = [];
  return {
    calls,
    success: value => { calls.push({ success: value }); },
    error: (code, message) => { calls.push({ code, message }); },
  };
}

test('start waits for the VPN result and propagates creation failure', async () => {
  const { service, parent, state } = await createService();
  const response = result();
  service.onMethodCall({ method: 'start' }, response);
  assert.equal(response.calls.length, 0);
  assert.equal(state.runState, 1);
  parent.start.complete(0, 'permission denied');
  assert.deepEqual(response.calls, [{ code: 'VPN_START_FAILED', message: 'permission denied' }]);
  assert.equal(state.runTime, 0);
  assert.equal(state.runState, 2);
});

test('stop is sent while startup is pending and stale start cannot overwrite its result', async () => {
  const { service, parent, state } = await createService();
  const start = result();
  const stop = result();
  service.onMethodCall({ method: 'start' }, start);
  service.onMethodCall({ method: 'stop' }, stop);
  assert.ok(parent.stop);
  assert.equal(stop.calls.length, 0);
  parent.stop.complete(0, '');
  parent.start.complete(123, '');
  assert.equal(state.runTime, 0);
  assert.equal(state.runState, 2);
  assert.deepEqual(stop.calls, [{ success: true }]);
  assert.deepEqual(start.calls, [{ success: false }]);
});

test('a stale stop does not clear a newer successful start', async () => {
  const { service, parent, state } = await createService();
  const stop = result();
  const start = result();
  service.onMethodCall({ method: 'stop' }, stop);
  service.onMethodCall({ method: 'start' }, start);
  parent.start.complete(456, '');
  parent.stop.complete(0, '');
  assert.equal(state.runTime, 456);
  assert.equal(state.runState, 0);
  assert.deepEqual(stop.calls, [{ success: false }]);
  assert.deepEqual(start.calls, [{ success: true }]);
});

test('disconnect rejects pending commands and ignores their late callbacks', async () => {
  const { service, parent, state } = await createService();
  service.onMethodCall({ method: 'init' }, result());
  const start = result();
  const stop = result();
  service.onMethodCall({ method: 'start' }, start);
  service.onMethodCall({ method: 'stop' }, stop);
  parent.disconnect('service process exited');
  parent.start.complete(123, '');
  parent.stop.complete(0, '');
  assert.deepEqual(start.calls, [{ code: 'VPN_SERVICE_DISCONNECTED', message: 'service process exited' }]);
  assert.deepEqual(stop.calls, start.calls);
  assert.equal(state.runTime, 0);
  assert.equal(state.runState, 2);
});

test('transport rejection completes a command only once', async () => {
  const { service, parent } = await createService();
  parent.handleStartService = async (_options, _time, stub) => {
    stub.complete(123, '');
    throw new Error('transport closed after callback');
  };
  const start = result();
  service.onMethodCall({ method: 'start' }, start);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(start.calls, [{ success: true }]);
});
