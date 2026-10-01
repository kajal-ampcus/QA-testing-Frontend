// Run with `node tests/graph-layout.cjs` after installing frontend dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve('src/features/application-map/graphLayout.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(compiled, filename);
const { layoutApplicationGraph } = loaded.exports;
const states = ['a', 'b', 'c', 'd', 'e'].map(id => ({
  id, state_code: `state-${id}`, fingerprint: `fp-${id}`, url_pattern: `/${id}`,
  reached_via: ['irrelevant discovery history'], elements: [],
}));
const relationships = [
  { source_state_id: 'a', target_state_id: 'b', label: 'Enter' },
  { parent_fingerprint: 'fp-b', child_fingerprint: 'fp-c', action: 'Open C' },
  { source: 'state-b', target: 'state-d', label: 'Open D' },
  { source: 'c', target: 'e', label: 'Details' },
  { source: 'd', target: 'e', label: 'Alternate parent' },
];
const graph = layoutApplicationGraph([...states, states[0]], [...relationships, relationships[0]], 244, 150);
assert.equal(graph.nodes.length, 5);
assert.equal(graph.edges.length, 4);
const byId = new Map(graph.nodes.map(node => [node.id, node]));
for (const edge of graph.edges) assert.ok(byId.get(edge.source).position.y < byId.get(edge.target).position.y);
assert.equal(byId.get('c').position.y, byId.get('d').position.y);
assert.equal(byId.get('a').data.isEntry, true);
assert.equal(byId.get('b').data.isEntry, false);
assert.deepEqual(layoutApplicationGraph([...states].reverse(), [...relationships].reverse(), 244, 150), graph);
const disconnected = layoutApplicationGraph(states, [], 244, 150);
assert.equal(disconnected.nodes.length, 5);
assert.equal(disconnected.edges.length, 0);
const cyclic = layoutApplicationGraph(states, [...relationships, { source: 'e', target: 'b', label: 'Return' }], 244, 150);
assert.equal(cyclic.edges.length, 4);
for (const node of cyclic.nodes) assert.ok(Number.isFinite(node.position.x) && Number.isFinite(node.position.y));
for (const a of cyclic.nodes) for (const b of cyclic.nodes) {
  if (a.id !== b.id) assert.ok(Math.abs(a.position.x - b.position.x) >= 244 || Math.abs(a.position.y - b.position.y) >= 150);
}
const duplicateLoginStates = [
  {
    id: 'login-entry', state_code: 'STATE-001', fingerprint: 'login-default',
    url_pattern: '/login', reached_via: [],
    elements: [{ role: 'RootWebArea', name: 'Example App' }, { role: 'heading', name: 'Admin sign in' }],
  },
  {
    id: 'login-filtered', state_code: 'STATE-002', fingerprint: 'login-filtered',
    url_pattern: '/login?role=admin#form', reached_via: ['click admin'],
    elements: [{ role: 'RootWebArea', name: 'Example App' }, { role: 'heading', name: 'Sign in' }],
  },
  {
    id: 'forgot', state_code: 'STATE-003', fingerprint: 'forgot',
    url_pattern: '/forgot-password', reached_via: ['navigate forgot'],
    elements: [{ role: 'RootWebArea', name: 'Example App' }, { role: 'heading', name: 'Reset password' }],
  },
];
const normalized = layoutApplicationGraph(duplicateLoginStates, [
  { source_state_id: 'login-entry', target_state_id: 'login-filtered', label: 'Click Admin' },
  { parent_fingerprint: 'login-filtered', child_fingerprint: 'forgot', action: 'Navigate to Forgot' },
  { source_state_id: 'forgot', target_state_id: 'login-entry', label: 'Back to Login' },
], 196, 64);
assert.equal(normalized.nodes.length, 2);
assert.equal(normalized.edges.length, 1);
assert.equal(normalized.edges[0].source, 'login-entry');
assert.equal(normalized.edges[0].target, 'forgot');
assert.equal('label' in normalized.edges[0], false);
assert.equal('action' in normalized.edges[0], false);
assert.deepEqual(normalized.nodes.find(node => node.id === 'login-entry').data.state.reached_via, ['click admin']);

const spaMenuNoise = [
  {
    id: 'dash', state_code: 'STATE-010', fingerprint: 'fp-dash',
    url_pattern: '/', reached_via: ['login'],
    elements: [{ role: 'RootWebArea', name: 'Kitchen POS' }, { role: 'heading', name: 'Menu' }, { role: 'heading', name: 'Dashboard' }],
  },
  {
    id: 'menu-a', state_code: 'STATE-011', fingerprint: 'fp-menu-a',
    url_pattern: '/', reached_via: ['click Menu'],
    elements: [{ role: 'RootWebArea', name: 'Menu | Kitchen POS' }, { role: 'heading', name: 'Menu' }],
  },
  {
    id: 'menu-b', state_code: 'STATE-012', fingerprint: 'fp-menu-b',
    url_pattern: '/', reached_via: ['click Menu again'],
    elements: [{ role: 'RootWebArea', name: 'Menu | Categories' }, { role: 'heading', name: 'Menu' }, { role: 'button', name: 'Pizza' }],
  },
  {
    id: 'orders', state_code: 'STATE-013', fingerprint: 'fp-orders',
    url_pattern: '/', reached_via: ['click Orders'],
    elements: [{ role: 'RootWebArea', name: 'Orders | Kitchen POS' }, { role: 'heading', name: 'Menu' }, { role: 'heading', name: 'Orders' }],
  },
];
const collapsedSpa = layoutApplicationGraph(spaMenuNoise, [
  { source_state_id: 'dash', target_state_id: 'menu-a' },
  { source_state_id: 'dash', target_state_id: 'menu-b' },
  { source_state_id: 'dash', target_state_id: 'orders' },
], 176, 60);
assert.equal(collapsedSpa.nodes.length, 3);
const spaNames = collapsedSpa.nodes.map(node => loaded.exports.functionalStateName(node.data.state)).sort();
assert.deepEqual(spaNames, ['Dashboard', 'Menu', 'Orders']);

const catalogItems = [
  {
    id: 'menu', state_code: 'STATE-020', fingerprint: 'fp-menu',
    url_pattern: '/menu', reached_via: ['click Menu'],
    elements: [{ role: 'RootWebArea', name: 'Today\'s Menu' }, { role: 'heading', name: 'Today\'s Menu' }],
  },
  {
    id: 'egg', state_code: 'STATE-021', fingerprint: 'fp-egg',
    url_pattern: '/menu/boiled-egg', reached_via: ['click Boiled Egg'],
    elements: [{ role: 'RootWebArea', name: 'Boiled Egg' }, { role: 'heading', name: 'Boiled Egg' }],
  },
  {
    id: 'coffee', state_code: 'STATE-022', fingerprint: 'fp-coffee',
    url_pattern: '/menu/coffee-sachet', reached_via: ['click Coffee Sachet'],
    elements: [{ role: 'RootWebArea', name: 'Coffee Sachet' }, { role: 'heading', name: 'Coffee Sachet' }],
  },
  {
    id: 'dash2', state_code: 'STATE-023', fingerprint: 'fp-dash2',
    url_pattern: '/dashboard', reached_via: ['login'],
    elements: [{ role: 'RootWebArea', name: 'Dashboard' }, { role: 'heading', name: 'Dashboard' }],
  },
];
const catalogGraph = layoutApplicationGraph(catalogItems, [
  { source_state_id: 'dash2', target_state_id: 'menu' },
  { source_state_id: 'menu', target_state_id: 'egg' },
  { source_state_id: 'menu', target_state_id: 'coffee' },
], 176, 60);
assert.equal(catalogGraph.nodes.length, 2);
const catalogNames = catalogGraph.nodes.map(node => loaded.exports.functionalStateName(node.data.state)).sort();
assert.deepEqual(catalogNames, ['Dashboard', 'Menu']);
assert.equal(catalogGraph.edges.length, 1);
assert.equal(catalogGraph.edges[0].source, 'dash2');
assert.equal(catalogGraph.edges[0].target, 'menu');

console.log('Graph layout checks passed: functional deduplication, edge remapping, label removal, hierarchy, cycles, and stable ordering.');
