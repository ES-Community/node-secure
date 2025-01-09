// Import Node.js Dependencies
import { describe, it, before, after } from "node:test";
import assert from "node:assert";

// Import Third-party Dependencies
import cacache from "cacache";

// Import Internal Dependencies
import { get, set } from "../src/http-server/config.js";
import { CACHE_PATH } from "../src/http-server/cache.js";

// CONSTANTS
const kConfigKey = "___config";

describe("config", { concurrency: 1 }, () => {
  let actualConfig;

  before(async() => {
    actualConfig = await get();
  });

  after(async() => {
    await set(actualConfig);
  });

  it("should get default config from empty cache", async() => {
    await cacache.rm(CACHE_PATH, kConfigKey);
    const value = await get();

    assert.deepStrictEqual(value, {
      defaultPackageMenu: "info",
      ignore: { flags: [], warnings: [] },
      standalone: false
    });
  });

  it("should get config from cache", async() => {
    await cacache.put(CACHE_PATH, kConfigKey, JSON.stringify({ foo: "bar" }));
    const value = await get();

    assert.deepStrictEqual(value, { foo: "bar", standalone: false });
  });

  it("should set config in cache", async() => {
    await set({ foo: "baz" });
    const value = await get();

    assert.deepStrictEqual(value, { foo: "baz", standalone: false });
  });
});

