// Isolated component logic checks; no browser, local-page navigation or UI.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const script = readFileSync(new URL('./checklist-page.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
const states = ['completed', 'pending', 'ready', 'deferred', 'review']
function fixture(search = '', hash = '') {
  const element = (dataset = {}) => ({ dataset, hidden: false, attrs: {}, listeners: {}, setAttribute(k,v) { this.attrs[k] = v }, addEventListener(k,fn) { this.listeners[k] = fn } })
  const buttons = states.map(state => element({ filter: state }))
  const items = states.map(state => ({ ...element({ state }), id: state + '-item', details: { open: false }, querySelector() { return this.details }, scrollIntoView() { this.scrolled = true } }))
  const groups = [items.slice(0,2), items.slice(2)].map(members => ({ ...element(), querySelectorAll() { return members } }))
  const controls = Object.fromEntries(['visible-count', 'empty', 'show-all', 'expand-visible', 'collapse-all'].map(id => [id, element()]))
  const location = new URL('https://fixture.invalid/checklist.html' + search + hash)
  const document = { querySelectorAll(selector) { return selector === '[data-filter]' ? buttons : selector === '.item' ? items : groups }, getElementById(id) { return controls[id] } }
  const events = {}
  vm.runInNewContext(script, { document, location, URL, URLSearchParams, history: { replaceState(_,__,url) { location.href = url.href } }, window: { addEventListener(event,fn) { events[event] = fn } } })
  return { buttons, items, groups, controls, location, events, click: state => buttons.find(button => button.dataset.filter === state).listeners.click() }
}

test('all states initially visible, all details closed; multi-selection is a union', () => {
  const f = fixture()
  assert(f.items.every(item => !item.hidden && !item.details.open))
  assert(f.buttons.every(button => button.attrs['aria-pressed'] === 'true'))
  for (const state of ['completed', 'pending', 'deferred']) f.click(state)
  assert.deepEqual(f.items.filter(item => !item.hidden).map(item => item.dataset.state), ['ready', 'review'])
  assert.equal(f.groups[0].hidden, true)
  assert.equal(f.controls['visible-count'].textContent, '2 of 5 items')
  assert.equal(f.location.searchParams.get('states'), 'ready,review')
  f.controls['expand-visible'].listeners.click()
  assert(f.items.filter(item => !item.hidden).every(item => item.details.open))
  assert(f.items.filter(item => item.hidden).every(item => !item.details.open))
  f.controls['collapse-all'].listeners.click()
  assert(f.items.every(item => !item.details.open))
})

test('no states shows a recoverable empty message; Show all restores every group', () => {
  const f = fixture('?states=')
  assert(f.items.every(item => item.hidden))
  assert(f.groups.every(group => group.hidden))
  assert.equal(f.controls.empty.hidden, false)
  f.controls['show-all'].listeners.click()
  assert(f.items.every(item => !item.hidden))
  assert(f.groups.every(group => !group.hidden))
  assert.equal(f.controls.empty.hidden, true)
  assert.equal(f.location.search, '')
})

test('saved filters survive reload and a deep link reveals its item', () => {
  const f = fixture('?states=ready', '#review-item')
  assert.deepEqual(f.items.filter(item => !item.hidden).map(item => item.dataset.state), ['ready', 'review'])
  assert.equal(f.items[4].details.open, true)
  assert.equal(f.items[4].scrolled, true)
  assert(f.items.slice(0,4).every(item => !item.details.open))
  f.location.search = '?states=pending'; f.location.hash = ''; f.events.popstate()
  assert.deepEqual(f.items.filter(item => !item.hidden).map(item => item.dataset.state), ['pending'])
})

test('malformed or unknown URL values do not inject selectors or throw', () => {
  const f = fixture('?states=unknown', '#%ZZ')
  assert.equal(f.controls.empty.hidden, false)
  f.controls['show-all'].listeners.click()
  assert.equal(f.items.filter(item => !item.hidden).length, 5)
})
