/**
 * A small async key-value store. In Excel this is OfficeRuntime.storage (per add-in, on this device, shared by
 * the custom functions and the task pane, about 10 MB). Outside Office (local harness, tests) it falls back to
 * localStorage or memory.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async getItem(key) {
      return data.has(key) ? (data.get(key) as string) : null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
  };
}

function localStore(ls: Storage): KeyValueStore {
  return {
    async getItem(key) {
      return ls.getItem(key);
    },
    async setItem(key, value) {
      ls.setItem(key, value);
    },
    async removeItem(key) {
      ls.removeItem(key);
    },
  };
}

/** The best store available in the current runtime. */
export function defaultStore(): KeyValueStore {
  const g = globalThis as unknown as { OfficeRuntime?: { storage?: KeyValueStore }; localStorage?: Storage };
  if (g.OfficeRuntime?.storage) {
    const s = g.OfficeRuntime.storage;
    return {
      getItem: (k) => s.getItem(k),
      setItem: (k, v) => s.setItem(k, v),
      removeItem: (k) => s.removeItem(k),
    };
  }
  try {
    if (g.localStorage) {
      const probe = "__calcbloc_probe__";
      g.localStorage.setItem(probe, "1");
      g.localStorage.removeItem(probe);
      return localStore(g.localStorage);
    }
  } catch {
    // Storage blocked (private window, sandboxed frame): use memory.
  }
  return memoryStore();
}
