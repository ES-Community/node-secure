// Import Node.js Dependencies
import fs, { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { after, before, describe, test, mock } from "node:test";
import { once } from "node:events";
import path from "node:path";
import assert from "node:assert";
import { pipeline as streamPipeline } from "node:stream";

// Import Third-party Dependencies
import { get, post, MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "@myunisoft/httpie";
import zup from "zup";
import * as i18n from "@nodesecure/i18n";
import * as flags from "@nodesecure/flags";
import enableDestroy from "server-destroy";
import cacache from "cacache";
import sendType from "@polka/send-type";

// Require Internal Dependencies
import { buildServer } from "../src/http-server/index.js";
import { CACHE_PATH } from "../src/http-server/cache.js";
import * as rootModule from "../src/http-server/endpoints/root.js";
import * as flagsModule from "../src/http-server/endpoints/flags.js";

// CONSTANTS
const HTTP_PORT = 17049;
const HTTP_URL = new URL(`http://localhost:${HTTP_PORT}`);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const JSON_PATH = path.join(__dirname, "fixtures", "httpServer.json");
const INDEX_HTML = fs.readFileSync(path.join(__dirname, "..", "views", "index.html"), "utf-8");

const kConfigKey = "___config";
const kGlobalDispatcher = getGlobalDispatcher();
const kMockAgent = new MockAgent();
const kBundlephobiaPool = kMockAgent.get("https://bundlephobia.com");
const kDefaultPayloadPath = path.join(process.cwd(), "nsecure-result.json");

describe("httpServer", { concurrency: 1 }, () => {
  let httpServer;

  before(async() => {
    setGlobalDispatcher(kMockAgent);
    await i18n.extendFromSystemPath(
      path.join(__dirname, "..", "i18n")
    );

    httpServer = buildServer(JSON_PATH, {
      port: HTTP_PORT,
      openLink: false,
      enableWS: false
    });
    await once(httpServer.server, "listening");

    enableDestroy(httpServer.server);

    if (fs.existsSync(kDefaultPayloadPath) === false) {
      // When running tests on CI, we need to create the nsecure-result.json file
      const payload = fs.readFileSync(JSON_PATH, "utf-8");
      fs.writeFileSync(kDefaultPayloadPath, payload);
    }
  }, { timeout: 5000 });

  after(async() => {
    httpServer.server.destroy();
    kBundlephobiaPool.close();
    setGlobalDispatcher(kGlobalDispatcher);
  });

  test("'/' should return index.html content", async() => {
    const i18nLangName = await i18n.getLocalLang();
    const result = await get(HTTP_URL);

    assert.equal(result.statusCode, 200);
    assert.equal(result.headers["content-type"], "text/html");

    const templateStr = zup(INDEX_HTML)({
      lang: i18n.getTokenSync("lang"),
      i18nLangName,
      token: (tokenName) => i18n.getTokenSync(`ui.${tokenName}`)
    });
    assert.equal(result.data, templateStr);
  });

  test("'/' should fail", () => {
    const errors = [];
    const sendTypeMock = mock.method(sendType, "default", (res, status, { error }) => errors.push(error));

    rootModule.get({}, {
      writeHead: () => {
        throw new Error("fake error");
      }
    });

    assert.deepEqual(errors, ["fake error"]);
    sendTypeMock.mock.restore();
  });

  test("'/flags' should return the flags list as JSON", async() => {
    const result = await get(new URL("/flags", HTTP_URL));

    assert.equal(result.statusCode, 200);
    assert.equal(result.headers["content-type"], "application/json;charset=utf-8");
  });

  test("'/flags/description/isGit' should return the isGit HTML description", async() => {
    const result = await get(new URL("/flags/description/isGit", HTTP_URL));

    assert.equal(result.statusCode, 200);
    assert.equal(result.headers["content-type"], "text/html");

    assert.equal(result.data, await flags.eagerFetchFlagFile("isGit"));
  });

  test("'/flags/description/foobar' should return a 404 error", async() => {
    await assert.rejects(async() => {
      await get(new URL("/flags/description/foobar", HTTP_URL));
    }, {
      name: "HttpieOnHttpError",
      statusCode: 404,
      statusMessage: "Not Found"
    });
  });

  test("'/flags/description/:title' should fail", () => {
    const logs = [];
    const streamPipelineMock = mock.method(streamPipeline, "pipeline", (stream, res, err) => err("fake error"));
    const createReadStreamMock = mock.method(createReadStream, "default", () => "foo");
    console.error = (data) => logs.push(data);
  
    flagsModule.get({ params: { title: "hasWarnings" } }, { writeHead: () => true });
  
    assert.deepEqual(logs, ["fake error"]);
  
    streamPipelineMock.restore(); 
    createReadStreamMock.restore(); 
  });
  
  before(async() => {
    const openMock = mock.method(buildServer, "open", () => {
      opened = true;
    });
  
    httpServer = buildServer(JSON_PATH);
    await once(httpServer.server, "listening");
    enableDestroy(httpServer.server);
    openMock.restore(); 
  });

  test("'/data' should return the fixture payload we expect", async() => {
    const result = await get(new URL("/data", HTTP_URL));

    assert.equal(result.statusCode, 200);
    assert.equal(result.headers["content-type"], "application/json;charset=utf-8");
  });

  test("'/bundle/:name/:version' should return the bundle size", async() => {
    kBundlephobiaPool.intercept({
      path: () => true
    }).reply(200, {
      gzip: 1,
      size: 1,
      dependencySizes: {
        foo: 1
      }
    }, { headers: { "content-type": "application/json" } });
    const result = await get(new URL("/bundle/flatstr/1.0.12", HTTP_URL));

    assert.equal(result.statusCode, 200);
    assert.equal(result.headers["content-type"], "application/json;charset=utf-8");
    checkBundleResponse(result.data);
  });

  test("'/bundle/:name/:version' should return an error if it fails", async() => {
    kBundlephobiaPool.intercept({
      path: () => true
    }).reply(404);
    const wrongVersion = undefined;

    await assert.rejects(async() => {
      await get(new URL(`/bundle/flatstr/${wrongVersion}`, HTTP_URL));
    },
    {
      name: "HttpieOnHttpError",
      statusCode: 404,
      statusMessage: "Not Found"
    });
  });

  test("'/bundle/:name' should return the bundle size of the last version", async() => {
    kBundlephobiaPool.intercept({
      path: () => true
    }).reply(200, {
      gzip: 1,
      size: 1,
      dependencySizes: {
        foo: 1
      }
    }, { headers: { "content-type": "application/json" } });
    const result = await get(new URL("/bundle/flatstr", HTTP_URL));

    assert.equal(result.statusCode, 200);
    assert.equal(result.headers["content-type"], "application/json;charset=utf-8");
    checkBundleResponse(result.data);
  });

  test("'/bundle/:name' should return an error if it fails", async() => {
    kBundlephobiaPool.intercept({
      path: () => true
    }).reply(404);
    const wrongPackageName = "br-br-br-brah";

    await assert.rejects(async() => {
      await get(new URL(`/bundle/${wrongPackageName}`, HTTP_URL));
    }, {
      name: "HttpieOnHttpError",
      statusCode: 404,
      statusMessage: "Not Found"
    });
  });

  test("GET '/config' should return the config", async() => {
    const { data: actualConfig } = await get(new URL("/config", HTTP_URL));

    await cacache.put(CACHE_PATH, kConfigKey, JSON.stringify({ foo: "bar" }));
    const result = await get(new URL("/config", HTTP_URL));

    assert.deepEqual(result.data, { foo: "bar" });

    await fetch(new URL("/config", HTTP_URL), {
      method: "PUT",
      body: JSON.stringify(actualConfig),
      headers: { "Content-Type": "application/json" }
    });
  });

  test("PUT '/config' should update the config", async() => {
    const { data: actualConfig } = await get(new URL("/config", HTTP_URL));
    // FIXME: use @mynusift/httpie instead of fetch. Atm it throws with put().
    // https://github.com/nodejs/undici/issues/583
    const { status } = await fetch(new URL("/config", HTTP_URL), {
      method: "PUT",
      body: JSON.stringify({ fooz: "baz" }),
      headers: { "Content-Type": "application/json" }
    });

    assert.equal(status, 204);

    const inCache = await cacache.get(CACHE_PATH, kConfigKey);
    assert.deepEqual(JSON.parse(inCache.data.toString()), { fooz: "baz" });

    await fetch(new URL("/config", HTTP_URL), {
      method: "PUT",
      body: JSON.stringify(actualConfig),
      headers: { "Content-Type": "application/json" }
    });
  });

  test("GET '/i18n' should return i18n", async() => {
    const result = await get(new URL("/i18n", HTTP_URL));
    assert.equal(result.statusCode, 200);

    const keys = Object.keys(result.data);
    assert.deepEqual(keys, ["english", "french"]);
  });

  test("'/download/:pkgName' should return package downloads", async() => {
    const result = await get(new URL("/downloads/fastify", HTTP_URL));

    assert.equal(result.statusCode, 200);
    assert.equal(result.data.package, "fastify");
    assert.ok(result.data.downloads);
    assert.ok(result.data.start);
    assert.ok(result.data.end);
  });

  test("'/download/:pkgName' should not find package", async() => {
    const wrongPackageName = "br-br-br-brah";

    await assert.rejects(async() => {
      await get(new URL(`/downloads/${wrongPackageName}`, HTTP_URL));
    }, {
      name: "HttpieOnHttpError",
      statusCode: 404,
      statusMessage: "Not Found"
    });
  });

  test("'/scorecard/:org/:pkgName' should return scorecard data", async() => {
    const result = await get(new URL("/scorecard/NodeSecure/cli", HTTP_URL));

    assert.equal(result.statusCode, 200);
    assert.equal(result.data.data.repo.name, "github.com/NodeSecure/cli");
  });

  test("'/scorecard/:org/:pkgName' should return scorecard data for GitLab repo", async() => {
    const result = await get(new URL("/scorecard/gitlab-org/gitlab-ui?platform=gitlab.com", HTTP_URL));

    assert.equal(result.statusCode, 200);
    assert.equal(result.data.data.repo.name, "gitlab.com/gitlab-org/gitlab-ui");
  });

  test("'/scorecard/:org/:pkgName' should not find repo", async() => {
    const wrongPackageName = "br-br-br-brah";

    await assert.rejects(async() => {
      await get(new URL(`/scorecard/NodeSecure/${wrongPackageName}`, HTTP_URL));
    }, {
      name: "HttpieOnHttpError",
      statusCode: 404,
      statusMessage: "Not Found"
    });
  });

  test("'/report' should return a Buffer", async() => {
    const result = await post(new URL("/report", HTTP_URL), { body: { title: "foo" } });

    assert.equal(result.statusCode, 200);
    const json = JSON.parse(result.data);
    assert.strictEqual(json.data.type, "Buffer");
  });

  test("'/search' should return the package list", async() => {
    const result = await get(new URL("/search/nodesecure", HTTP_URL));

    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.ok(Array.isArray(result.data.result));
    assert.ok(result.data.count);
  });
});

describe("httpServer without options", () => {
  let httpServer;
  let opened = false;
  process.env.NODE_ENV = "test";

  before(async() => {
    const openMock = mock.method(buildServer, "open", () => {
      opened = true;
    });

    httpServer = buildServer(JSON_PATH);
    await once(httpServer.server, "listening");
    enableDestroy(httpServer.server);
    openMock.mock.restoreAll();
  });

  after(async() => {
    httpServer.server.destroy();
  });

  test("should listen on random port", () => {
    assert.ok(httpServer.server.address().port > 0);
  });

  test("should have openLink to true", () => {
    assert.equal(opened, true);
  });
});

/**
 * HELPERS
 */

function checkBundleResponse(payload) {
  assert.ok(payload.gzip);
  assert.ok(payload.size);
  assert.ok(payload.dependencySizes);
}
