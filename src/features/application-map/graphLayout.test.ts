import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppState } from "../../types/api";
import {
  selectApplicationFlowTree,
  type GraphRelationship,
} from "./graphLayout.ts";

const AUTH = "click(role=authentication,name='Log in')";

function page(
  code: string,
  url: string,
  fingerprint: string,
  reachedVia: string[],
): AppState {
  return {
    state_code: code,
    url_pattern: url,
    fingerprint,
    reached_via: reachedVia,
    elements: [],
  };
}

function mesh(
  parent: string,
  child: string,
  action: string,
): GraphRelationship {
  return { parent_fingerprint: parent, child_fingerprint: child, action };
}

const cafinityStates: AppState[] = [
  page("STATE-001", "/login", "login", []),
  page("STATE-002", "/forgot-password", "forgot", [
    "navigate(url='https://cafinity.test/forgot-password',observed_link='Forgot Password')",
  ]),
  page("STATE-003", "/dashboard", "dashboard", [AUTH]),
  page("STATE-004", "/orders", "orders", [
    AUTH,
    "navigate(url='https://cafinity.test/orders',observed_link='Orders')",
  ]),
  page("STATE-005", "/notifications", "notifications", [
    AUTH,
    "navigate(url='https://cafinity.test/notifications',observed_link='Alerts')",
  ]),
  page("STATE-006", "/menu", "menu", [
    AUTH,
    "navigate(url='https://cafinity.test/orders',observed_link='Orders')",
  ]),
  page("STATE-007", "/cart", "cart", [
    AUTH,
    "navigate(url='https://cafinity.test/orders',observed_link='Orders')",
  ]),
];

const chromePages = ["dashboard", "menu", "orders", "notifications"] as const;

function chromeMesh(): GraphRelationship[] {
  const edges: GraphRelationship[] = [
    mesh(
      "login",
      "forgot",
      "navigate(url='https://cafinity.test/forgot-password',observed_link='Forgot Password')",
    ),
    mesh(
      "forgot",
      "login",
      "navigate(url='https://cafinity.test/login',observed_link='Back to Login')",
    ),
    mesh("menu", "cart", "click(role=button,name='View Cart 1')"),
    mesh(
      "cart",
      "menu",
      "navigate(url='https://cafinity.test/menu',observed_link='Continue ordering')",
    ),
  ];
  for (const source of chromePages) {
    for (const target of chromePages) {
      if (source === target) continue;
      edges.push(
        mesh(
          source,
          target,
          `navigate(url='https://cafinity.test/${target}',observed_link='${target}')`,
        ),
      );
    }
  }
  return edges;
}

function parentsOf(edges: { source: string; target: string }[]) {
  const parents = new Map<string, string>();
  const targets = new Set<string>();
  for (const edge of edges) {
    parents.set(edge.target, edge.source);
    targets.add(edge.target);
  }
  const roots = [
    ...new Set(edges.flatMap((edge) => [edge.source, edge.target])),
  ].filter((id) => !targets.has(id));
  return { parents, roots };
}

test("Cafinity-shaped map is one tree from Login, not a Cart root", () => {
  const { edges } = selectApplicationFlowTree(cafinityStates, chromeMesh());
  const { parents, roots } = parentsOf(edges);
  assert.deepEqual(roots, ["STATE-001"]);
  assert.equal(parents.get("STATE-002"), "STATE-001");
  assert.equal(parents.get("STATE-003"), "STATE-001");
  assert.equal(parents.get("STATE-004"), "STATE-003");
  assert.equal(parents.get("STATE-005"), "STATE-003");
  assert.equal(parents.get("STATE-006"), "STATE-003");
  assert.equal(parents.get("STATE-007"), "STATE-006");
  assert.notEqual(parents.get("STATE-007"), undefined);
});

test("Cart is a Dashboard sibling when Dashboard has a hop to Cart", () => {
  const { edges } = selectApplicationFlowTree(cafinityStates, [
    ...chromeMesh(),
    mesh(
      "dashboard",
      "cart",
      "navigate(url='https://cafinity.test/cart',observed_link='Cart')",
    ),
  ]);
  const { parents, roots } = parentsOf(edges);
  assert.deepEqual(roots, ["STATE-001"]);
  assert.equal(parents.get("STATE-007"), "STATE-003");
  assert.equal(parents.get("STATE-006"), "STATE-003");
});
