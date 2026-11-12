import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyThemePreference,
  nextThemePreference,
  parseThemePreference,
  readThemePreference,
  storeThemePreference,
} from "../../util/common/theme";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    removeAttribute: (name: string) => void attrs.delete(name),
    attrs,
  };
}

describe("parseThemePreference", () => {
  it("keeps light and dark", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
  });

  it.each([null, undefined, "", "system", "DARK", "sepia", 1])("treats %p as system", (value) => {
    expect(parseThemePreference(value)).toBe("system");
  });
});

describe("nextThemePreference", () => {
  it("cycles Light -> Dark -> System -> Light", () => {
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
    expect(nextThemePreference("system")).toBe("light");
  });
});

describe("readThemePreference / storeThemePreference", () => {
  it("round-trips light and dark through storage", () => {
    const storage = memoryStorage();
    storeThemePreference("dark", storage);
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(readThemePreference(storage)).toBe("dark");
  });

  it("removes the stored value for system instead of storing it", () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: "dark" });
    storeThemePreference("system", storage);
    expect(storage.data.has(THEME_STORAGE_KEY)).toBe(false);
    expect(readThemePreference(storage)).toBe("system");
  });

  it("falls back to system for a garbage stored value", () => {
    expect(readThemePreference(memoryStorage({ [THEME_STORAGE_KEY]: "sepia" }))).toBe("system");
  });

  it("falls back to system when storage is missing or throws", () => {
    expect(readThemePreference(undefined)).toBe("system");
    expect(readThemePreference(throwingStorage)).toBe("system");
    expect(() => storeThemePreference("dark", throwingStorage)).not.toThrow();
    expect(() => storeThemePreference("system", throwingStorage)).not.toThrow();
  });
});

describe("applyThemePreference", () => {
  it("stamps data-theme for light and dark", () => {
    const root = fakeRoot();
    applyThemePreference("dark", root);
    expect(root.attrs.get("data-theme")).toBe("dark");
    applyThemePreference("light", root);
    expect(root.attrs.get("data-theme")).toBe("light");
  });

  it("removes data-theme for system so prefers-color-scheme decides", () => {
    const root = fakeRoot();
    applyThemePreference("dark", root);
    applyThemePreference("system", root);
    expect(root.attrs.has("data-theme")).toBe(false);
  });
});

describe("THEME_INIT_SCRIPT", () => {
  // Runs the inlined string the way the browser does, against stand-in globals -- it's
  // hand-written ES5, so this is what keeps it in step with the functions above.
  function run(storage: Pick<Storage, "getItem">) {
    const root = fakeRoot();
    new Function("localStorage", "document", THEME_INIT_SCRIPT)(storage, { documentElement: root });
    return root.attrs.get("data-theme");
  }

  it("stamps the stored light/dark preference", () => {
    expect(run(memoryStorage({ [THEME_STORAGE_KEY]: "dark" }))).toBe("dark");
    expect(run(memoryStorage({ [THEME_STORAGE_KEY]: "light" }))).toBe("light");
  });

  it("leaves data-theme off for system, a garbage value, or nothing stored", () => {
    expect(run(memoryStorage())).toBeUndefined();
    expect(run(memoryStorage({ [THEME_STORAGE_KEY]: "sepia" }))).toBeUndefined();
  });

  it("swallows a throwing localStorage", () => {
    expect(run(throwingStorage)).toBeUndefined();
  });
});
