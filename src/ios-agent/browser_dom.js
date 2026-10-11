// Fixed read-only Inspector projection. No input, event dispatch or page changes.
(() => {
  const selector = __SELECTOR__;
  const nodes = document.querySelectorAll(selector || 'button,input,textarea,select,summary,a,[role="button"],[role="switch"],[role="checkbox"],output');
  const viewport = { width: innerWidth, height: innerHeight };
  const rect = r => ({ x: r.x, y: r.y, width: r.width, height: r.height });
  const items = Array.from(nodes).slice(0, 200).map((element, index) => {
    const bounds = element.getBoundingClientRect();
    let left = Math.max(0, bounds.left), top = Math.max(0, bounds.top);
    let right = Math.min(innerWidth, bounds.right), bottom = Math.min(innerHeight, bounds.bottom);
    let hidden = false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) hidden = true;
      if (parent === element) continue;
      const r = parent.getBoundingClientRect();
      if (/hidden|clip|auto|scroll/.test(style.overflowX)) { left = Math.max(left, r.left); right = Math.min(right, r.right); }
      if (/hidden|clip|auto|scroll/.test(style.overflowY)) { top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom); }
    }
    const visible = !hidden && element.getClientRects().length > 0 && right > left && bottom > top;
    const point = visible ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null;
    const hit = point ? document.elementFromPoint(point.x, point.y) : null;
    const sensitive = element.type === 'password' || /password|token|secret|authorization/i.test([element.name, element.id, element.autocomplete].join(' '));
    const value = 'value' in element ? (sensitive ? '<redacted>' : String(element.value).slice(0, 500)) : undefined;
    return {
      index, tag: element.tagName.toLowerCase(), role: element.getAttribute('role'),
      label: (element.getAttribute('aria-label') || Array.from(element.labels || []).map(n => n.textContent).join(' ') || element.innerText || element.title || '').trim().slice(0, 300),
      id: element.id.slice(0, 120), name: (element.name || '').slice(0, 120),
      value, checked: typeof element.checked === 'boolean' ? element.checked : undefined,
      disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
      open: element.tagName === 'SUMMARY' ? element.parentElement?.open : undefined,
      options: element.tagName === 'SELECT' ? Array.from(element.options).slice(0, 30).map(n => ({label: n.text.slice(0, 120), value: n.value.slice(0, 120), selected: n.selected})) : undefined,
      bounds: rect(bounds), visible, clipped: right - left < bounds.width || bottom - top < bounds.height,
      hitAtVisibleCenter: !!hit && (hit === element || element.contains(hit)), point,
    };
  });
  return { viewport, matchedCount: nodes.length, truncated: nodes.length > items.length, items,
    limitations: 'Read-only layout sample; hit test is not trusted input, native accessibility or proof of successful interaction.' };
})()
