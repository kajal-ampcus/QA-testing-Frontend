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

console.log('Graph layout checks passed: functional deduplication, edge remapping, label removal, hierarchy, cycles, and stable ordering.');
