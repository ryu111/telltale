// Ticket 05: fake engine for testing hooks modules without the real host.
// SDD §4. Implements only the seven whitelisted `$` ops (SDD §1.4 / 00-共同規則);
// anything a hooks module calls beyond these is a bug in the code under test,
// not something this harness should quietly support.

// ── module-load side effect: install the JSX globals the real host provides ──

type JsxTag = string | ((props: Record<string, unknown>) => unknown);

const h = (tag: JsxTag, props: Record<string, unknown> | null | undefined, ...children: unknown[]): unknown => {
  const flatChildren = children
    .flat(Infinity as 1)
    .filter((child) => child !== null && child !== undefined && typeof child !== "boolean");
  if (typeof tag === "string") {
    return { type: tag, props: props ?? undefined, children: flatChildren };
  }
  return tag({ ...(props ?? {}), children: flatChildren });
};

const Fragment = (props: { children?: unknown[] }): unknown => ({
  type: "Box",
  props: {},
  children: props.children ?? [],
});

Object.assign(globalThis, { h, Fragment });

// ── the fake `$` surface ──

const ELEMENTS = { Box: "Box", Text: "Text", Client: "Client" } as const;

const NEXT_RENDER = { type: "Text", children: ["<next>"] };

// `$.store` round-trips through JSON like the real one (SDD §1.4 / claude-code.d.ts store.set):
// `undefined` stays `undefined` (nothing stored yet) instead of blowing up on
// `JSON.parse(JSON.stringify(undefined))`.
const roundTrip = <T,>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

type Matcher = Record<string, unknown> | undefined;
type Next = (e: Record<string, unknown>) => Promise<unknown>;
type Hook = ($: FakeDollar, e: Record<string, unknown>, next: Next) => unknown;
type OnFn = (pattern: string, matcherOrHook: Matcher | Hook, maybeHook?: Hook) => unknown;

export type FakeDollar = {
  ui: {
    resolve: (e?: unknown) => typeof ELEMENTS;
    invalidate: (scope?: string) => void;
  };
  clock: {
    now: () => number;
    every: (ms: number, fn: () => unknown) => { cancel: () => void };
  };
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  command: {
    register: (spec: { name: string; description?: string; argumentHint?: string }) => Promise<{ command: string }>;
  };
};

export type FakeEngineOpts = {
  store?: Record<string, unknown>;
  now?: number;
  options?: Record<string, unknown>;
};

export type FakeEngine = {
  on: OnFn;
  $: FakeDollar;
  fire: (event: string, e: Record<string, unknown>) => Promise<unknown>;
  store: Record<string, unknown>;
  calls: Record<string, number>;
  invalidations: number;
  registered: string[];
  timers: { ms: number; fn: () => unknown }[];
  tick: (id: string) => Promise<void>;
  now: number;
  NEXT_RENDER: typeof NEXT_RENDER;
};

export const fakeEngine = (opts: FakeEngineOpts = {}): FakeEngine => {
  const store: Record<string, unknown> = roundTrip(opts.store) ?? {};
  const calls: Record<string, number> = {};
  const registered: string[] = [];
  const timers: { ms: number; fn: () => unknown }[] = [];
  // Keyed by the tick function's `.name`: register.tsx names each panel's
  // tick closure after the panel id (SDD §3), so `tick(id)` can find it
  // without the harness needing to know about panels at all.
  const tickFns: Record<string, () => unknown> = {};
  const handlers: Record<string, { matcher: Matcher; hook: Hook }[]> = {};
  const state = { now: opts.now ?? 0, invalidations: 0 };

  const bump = (op: string): void => {
    calls[op] = (calls[op] ?? 0) + 1;
  };

  const $: FakeDollar = {
    ui: {
      resolve: () => {
        bump("$.ui.resolve");
        return ELEMENTS;
      },
      invalidate: () => {
        bump("$.ui.invalidate");
        state.invalidations += 1;
      },
    },
    clock: {
      now: async () => {
        bump("$.clock.now");
        return state.now; // async since 2.1.274: a Promise in Client props is refused as "a class instance"
      },
      every: (ms, fn) => {
        bump("$.clock.every");
        timers.push({ ms, fn });
        if (fn.name) tickFns[fn.name] = fn;
        return { cancel: () => {} };
      },
    },
    store: {
      get: async (key) => {
        bump("$.store.get");
        return roundTrip(store[key]);
      },
      set: async (key, value) => {
        bump("$.store.set");
        store[key] = roundTrip(value);
      },
    },
    command: {
      register: async (spec) => {
        bump("$.command.register");
        registered.push(spec.name);
        return { command: spec.name };
      },
    },
  };

  const on: OnFn = (pattern, matcherOrHook, maybeHook) => {
    const hook = (maybeHook ?? matcherOrHook) as Hook;
    const matcher = maybeHook ? (matcherOrHook as Matcher) : undefined;
    (handlers[pattern] ??= []).push({ matcher, hook });
    return {};
  };

  const matches = (matcher: Matcher, e: Record<string, unknown>): boolean =>
    !matcher || Object.entries(matcher).every(([key, value]) => e[key] === value);

  const fire = async (event: string, e: Record<string, unknown>): Promise<unknown> => {
    const next: Next = async () => (event === "ui.render" ? NEXT_RENDER : {});
    const entry = (handlers[event] ?? []).find((candidate) => matches(candidate.matcher, e));
    if (!entry) return next(e);
    return entry.hook($, e, next);
  };

  const tick = async (id: string): Promise<void> => {
    const fn = tickFns[id];
    if (!fn) throw new Error(`fakeEngine.tick: no timer registered for panel "${id}"`);
    await fn();
  };

  const eng = { on, $, fire, store, calls, registered, timers, tick, NEXT_RENDER } as FakeEngine;
  Object.defineProperty(eng, "now", {
    get: () => state.now,
    set: (value: number) => {
      state.now = value;
    },
    enumerable: true,
  });
  Object.defineProperty(eng, "invalidations", {
    get: () => state.invalidations,
    enumerable: true,
  });
  return eng;
};

export const clientOf = (tree: unknown): { type: string; props: Record<string, unknown> } | null => {
  if (!tree || typeof tree !== "object") return null;
  const node = tree as { type?: unknown; children?: unknown[]; props?: Record<string, unknown> };
  if (node.type === "Client") return node as { type: string; props: Record<string, unknown> };
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = clientOf(child);
      if (found) return found;
    }
  }
  return null;
};
