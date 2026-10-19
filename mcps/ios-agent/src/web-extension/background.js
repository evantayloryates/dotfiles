/* Disabled experimental extension. Arm explicitly from its Safari popup. */
const DEV_URL = '__DEV_URL__';
const LAUNCH = 'runner-one-shot-dev-tab';
const CLEANUP = 'runner-close-owned-probe-tab';
async function closeOwnTab() {
  const state = await browser.storage.local.get(['probeTab']);
  if (Number.isInteger(state.probeTab)) {
    try {
      const tab = await browser.tabs.get(state.probeTab);
      // Never close a tab the user has navigated elsewhere.
      if (tab.url === DEV_URL) await browser.tabs.remove(state.probeTab);
    } catch (_) {}
  }
  await browser.alarms.clear(LAUNCH);
  await browser.alarms.clear(CLEANUP);
  await browser.storage.local.set({armed: false, probeTab: null, phase: 'closed', observedAt: Date.now()});
  return {ok: true};
}
browser.runtime.onMessage.addListener(async message => {
  if (message?.action === 'status') {
    const state = await browser.storage.local.get(['phase', 'armed', 'observedAt']);
    return {phase: state.phase || 'idle', armed: state.armed === true, observedAt: state.observedAt || null};
  }
  if (message?.action === 'arm') {
    await closeOwnTab();
    await browser.storage.local.set({armed: true, phase: 'armed', observedAt: Date.now()});
    await browser.alarms.create(LAUNCH, {when: Date.now() + 20000});
    return {ok: true};
  }
  if (message?.action === 'close') return closeOwnTab();
  return {ok: false, reason: 'fixed_probe_action_required'};
});
browser.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === CLEANUP) return closeOwnTab();
  if (alarm.name !== LAUNCH) return;
  const state = await browser.storage.local.get(['armed']);
  if (state.armed !== true) return;
  await browser.storage.local.set({armed: false, phase: 'dispatching', observedAt: Date.now()});
  try {
    const tab = await browser.tabs.create({url: DEV_URL, active: true});
    await browser.storage.local.set({probeTab: tab.id, phase: 'created', observedAt: Date.now()});
    await browser.alarms.create(CLEANUP, {when: Date.now() + 60000});
  } catch (_) {
    await browser.storage.local.set({phase: 'unconfirmed', observedAt: Date.now()});
  }
});
