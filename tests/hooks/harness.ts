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
// `turn.step` is claude-code's one streaming event (claude-code.d.ts
// `StreamingEventName`): its hooks are `async function*`, and `next(e)`
// is a fresh stream (an async generator), not a Promise — `yield* next(e)`
// both forwards every chunk and evaluates to what the stream returns.
// This harness never models chunks (no test needs one), so `next(e)`'s
// generator yields nothing and just returns the (possibly overridden) result.
type StreamNext = (e: Record<string, unknown>) => AsyncGenerator<unknown, unknown>;
type StreamHook = ($: FakeDollar, e: Record<string, unknown>, next: StreamNext) => AsyncGenerator<unknown, unknown>;
type Hook = (($: FakeDollar, e: Record<string, unknown>, next: Next) => unknown) | StreamHook;
type OnFn = (pattern: string, matcherOrHook: Matcher | Hook, maybeHook?: Hook) => unknown;

// Ticket 12's harness 擴充: a minimal structural stand-in for claude-code's
// `AgentInfo` (id/description/type/status + the optional pairing fields),
// spelled out locally so this file doesn't need the (untracked, per-session
// generated) claude-code.d.ts to exist for `bun test` to run.
export type FakeAgentInfo = {
  id: string;
  description: string;
  type: string;
  status: string;
  parentId?: string;
  spawnedBy?: string;
  name?: string;
};

export type FakeDollar = {
  ui: {
    resolve: (e?: unknown) => typeof ELEMENTS;
    invalidate: (scope?: string) => void;
    open: (args: Record<string, unknown>) => void;
    close: (args: Record<string, unknown> | string) => void;
  };
  clock: {
    now: () => number;
    every: (ms: number, fn: () => unknown) => { cancel: () => void };
  };
  store: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    // Ticket 26: session-keyed live data needs to enumerate and drop stale keys.
    delete: (key: string) => Promise<void>;
    keys: () => Promise<string[]>;
  };
  // Ticket 26: `$.session.id()` — the transcript file's name; stable across resume.
  session: {
    id: () => Promise<string>;
  };
  command: {
    register: (spec: { name: string; description?: string; argumentHint?: string }) => Promise<{ command: string }>;
  };
  agent: {
    list: () => Promise<FakeAgentInfo[]>;
  };
  env: {
    get: (name: string) => string | undefined;
  };
};

export type FakeEngineOpts = {
  store?: Record<string, unknown>;
  now?: number;
  options?: Record<string, unknown>;
  env?: Record<string, string>;
  agents?: FakeAgentInfo[];
  // Ticket 26: what `$.session.id()` returns (default "s1").
  sessionId?: string;
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
  opened: string[];
  // Ticket 12: the next `fire(event, e)`'s `next(e)` resolves to `value`
  // instead of the default stub, consumed once.
  setNextResult: (event: string, value: unknown) => void;
  // Ticket 13: live bindings so a test can change what `$.agent.list()`/
  // `$.env.get()` return between ticks, mirroring `now`'s getter/setter below.
  agents: FakeAgentInfo[];
  env: Record<string, string>;
};

export const fakeEngine = (opts: FakeEngineOpts = {}): FakeEngine => {
  const store: Record<string, unknown> = roundTrip(opts.store) ?? {};
  const calls: Record<string, number> = {};
  const registered: string[] = [];
  const timers: { ms: number; fn: () => unknown }[] = [];
  const opened: string[] = [];
  let env: Record<string, string> = { ...(opts.env ?? {}) };
  let agents: FakeAgentInfo[] = (opts.agents ?? []).map((a) => ({ ...a }));
  let nextOverride: { event: string; value: unknown } | undefined;
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
      open: (args) => {
        bump("$.ui.open");
        const id = (args as { id?: unknown }).id;
        opened.push(typeof id === "string" ? id : JSON.stringify(args));
      },
      close: (args) => {
        bump("$.ui.close");
        // The real call takes `{ id }` (claude-code.d.ts PaneCloseArgs); an id
        // that is not open is left alone, like the engine does.
        const id = typeof args === "string" ? args : (args as { id?: unknown }).id;
        const at = opened.indexOf(String(id));
        if (at >= 0) opened.splice(at, 1);
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
      delete: async (key) => {
        bump("$.store.delete");
        delete store[key];
      },
      keys: async () => {
        bump("$.store.keys");
        return Object.keys(store);
      },
    },
    session: {
      id: async () => {
        bump("$.session.id");
        return opts.sessionId ?? "s1";
      },
    },
    command: {
      register: async (spec) => {
        bump("$.command.register");
        registered.push(spec.name);
        return { command: spec.name };
      },
    },
    agent: {
      list: async () => {
        bump("$.agent.list");
        return agents.map((a) => ({ ...a }));
      },
    },
    env: {
      get: (name) => {
        bump("$.env.get");
        return env[name];
      },
    },
  };

  const on: OnFn = (pattern, matcherOrHook, maybeHook) => {
    const hook = (maybeHook ?? matcherOrHook) as Hook;
    const matcher = maybeHook ? (matcherOrHook as Matcher) : undefined;
    (handlers[pattern] ??= []).push({ matcher, hook });
    return {};
  };

  // Nested partial match: an object matcher value recurses into the same
  // key of `e` (claude-code's real `Matcher` allows
  // `{ origin: { kind: "task-notification" } }`); any other value is `===`.
  const matches = (matcher: Matcher, e: Record<string, unknown>): boolean => {
    if (!matcher) return true;
    return Object.entries(matcher).every(([key, value]) => {
      const actual = e[key];
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
        return matches(value as Record<string, unknown>, actual as Record<string, unknown>);
      }
      return actual === value;
    });
  };

  const setNextResult = (event: string, value: unknown): void => {
    nextOverride = { event, value };
  };

  const consumeOverride = (event: string): { hit: boolean; value: unknown } => {
    if (nextOverride && nextOverride.event === event) {
      const { value } = nextOverride;
      nextOverride = undefined;
      return { hit: true, value };
    }
    return { hit: false, value: undefined };
  };

  const fire = async (event: string, e: Record<string, unknown>): Promise<unknown> => {
    if (event === "turn.step") {
      const streamNext: StreamNext = async function* () {
        const { hit, value } = consumeOverride("turn.step");
        return hit ? value : {};
      };
      const entry = (handlers[event] ?? []).find((candidate) => matches(candidate.matcher, e));
      const gen = entry ? (entry.hook as StreamHook)($, e, streamNext) : streamNext(e);
      let step = await gen.next();
      while (!step.done) step = await gen.next();
      return step.value;
    }

    const next: Next = async () => {
      const { hit, value } = consumeOverride(event);
      if (hit) return value;
      return event === "ui.render" ? NEXT_RENDER : {};
    };
    const entry = (handlers[event] ?? []).find((candidate) => matches(candidate.matcher, e));
    if (!entry) return next(e);
    return entry.hook($, e, next);
  };

  const tick = async (id: string): Promise<void> => {
    const fn = tickFns[id];
    if (!fn) throw new Error(`fakeEngine.tick: no timer registered for panel "${id}"`);
    await fn();
  };

  const eng = { on, $, fire, store, calls, registered, timers, tick, NEXT_RENDER, opened, setNextResult } as FakeEngine;
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
  Object.defineProperty(eng, "agents", {
    get: () => agents,
    set: (value: FakeAgentInfo[]) => {
      agents = value;
    },
    enumerable: true,
  });
  Object.defineProperty(eng, "env", {
    get: () => env,
    set: (value: Record<string, string>) => {
      env = value;
    },
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
