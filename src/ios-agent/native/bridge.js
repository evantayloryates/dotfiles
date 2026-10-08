/* Build-level prelude. Active only when the opt-in native dev module exists. */
import {LogBox, NativeEventEmitter, NativeModules} from 'react-native';

const bridge = __DEV__ ? NativeModules.IOSAgentBridge : null;
if (bridge && !global.__IOS_AGENT_BRIDGE_STARTED__) {
  global.__IOS_AGENT_BRIDGE_STARTED__ = true;
  const listeners = new Set();
  let disconnect;
  let sequence = 0;
  let telemetry;
  const publish = () => bridge.publish(JSON.stringify({
    ready: true,
    protocol: 1,
    hermes: Boolean(global.HermesInternal),
    diagnostics: telemetry?.snapshot() || {active: false},
    logBoxHidden: true,
    consoleContentExported: false,
  }));
  telemetry = require('./telemetry').installTelemetry(global, {onChange: publish});
  LogBox.ignoreAllLogs(true);
  new NativeEventEmitter(bridge).addListener('IOSAgentCommand', ({command, message}) => {
    if (command === 'session-start') {
      disconnect?.();
      listeners.clear();
      telemetry.start();
      disconnect = require('react-devtools-core').connectWithCustomMessagingProtocol({
        onSubscribe: listener => listeners.add(listener),
        onUnsubscribe: listener => listeners.delete(listener),
        onMessage: (event, payload) => bridge.sendReact(JSON.stringify({event, payload, sequence: ++sequence})),
      });
    } else if (command === 'session-end') {
      disconnect?.();
      disconnect = undefined;
      listeners.clear();
      telemetry.stop();
    } else if (command === 'react') {
      try {
        const frame = JSON.parse(message);
        for (const listener of listeners) listener(frame);
      } catch {
        telemetry.error(false, 'protocol');
      }
    }
  });
  publish();
}
