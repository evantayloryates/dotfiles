/* Build-level prelude. Active only when the opt-in native dev module exists. */
import {LogBox, NativeEventEmitter, NativeModules} from 'react-native';

const bridge = __DEV__ ? NativeModules.IOSAgentBridge : null;
if (bridge && !global.__IOS_AGENT_BRIDGE_STARTED__) {
  global.__IOS_AGENT_BRIDGE_STARTED__ = true;
  const listeners = new Set();
  let disconnect;
  let sequence = 0;
  const counts = {warn: 0, error: 0};
  const publish = () => bridge.publish(JSON.stringify({
    ready: true,
    protocol: 1,
    hermes: Boolean(global.HermesInternal),
    diagnostics: {...counts},
    logBoxHidden: true,
    consoleContentExported: false,
  }));
  // Retain original console behavior; surface metadata without exporting message bodies.
  for (const level of ['warn', 'error']) {
    const original = console[level];
    console[level] = function (...args) {
      counts[level] += 1;
      publish();
      return original.apply(this, args);
    };
  }
  LogBox.ignoreAllLogs(true);
  new NativeEventEmitter(bridge).addListener('IOSAgentCommand', ({command, message}) => {
    if (command === 'session-start') {
      disconnect?.();
      listeners.clear();
      disconnect = require('react-devtools-core').connectWithCustomMessagingProtocol({
        onSubscribe: listener => listeners.add(listener),
        onUnsubscribe: listener => listeners.delete(listener),
        onMessage: (event, payload) => bridge.sendReact(JSON.stringify({event, payload, sequence: ++sequence})),
      });
    } else if (command === 'session-end') {
      disconnect?.();
      disconnect = undefined;
      listeners.clear();
    } else if (command === 'react') {
      try {
        const frame = JSON.parse(message);
        for (const listener of listeners) listener(frame);
      } catch {
        counts.error += 1;
        publish();
      }
    }
  });
  publish();
}
