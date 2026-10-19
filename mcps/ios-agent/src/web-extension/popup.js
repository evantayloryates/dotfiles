async function update(action) {
  try {
    if (action) await browser.runtime.sendMessage({action});
    const state = await browser.runtime.sendMessage({action: 'status'});
    document.querySelector('#status').textContent = `State: ${state.phase}`;
  } catch (_) { document.querySelector('#status').textContent = 'State unconfirmed'; }
}
document.querySelector('#arm').addEventListener('click', () => update('arm'));
document.querySelector('#close').addEventListener('click', () => update('close'));
update();
