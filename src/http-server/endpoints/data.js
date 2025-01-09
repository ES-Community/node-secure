// Import Node.js Dependencies
import fs from "node:fs";
import path from "node:path";

// Import Third-party Dependencies
import send from "@polka/send-type";

// Import Internal Dependencies
import { appCache } from "../cache.js";
import { logger } from "../logger.js";

// CONSTANTS
const kDefaultPayloadPath = path.join(process.cwd(), "nsecure-result.json");

export async function get(req, res) {
  if (appCache.isStandalone) {
    logger.info("[data|get] standalone mode");
    const payload = await appCache.getStandalonePayload();
    send(res, 200, payload);

    return;
  }

  try {
    const { current, lru } = await appCache.payloadsList();
    logger.info(`[data|get](current: ${current})`);
    logger.debug(`[data|get](lru: ${lru})`);

    const formatted = current.replaceAll("/", "-");
    send(res, 200, await appCache.getPayload(formatted));
  }
  catch {
    logger.error(`[data|get](No cache yet. Creating one...)`);

    const payload = JSON.parse(fs.readFileSync(kDefaultPayloadPath, "utf-8"));
    const version = Object.keys(payload.dependencies[payload.rootDependencyName].versions)[0];
    const formatted = `${payload.rootDependencyName}@${version}`;
    const payloadsList = {
      lru: [formatted],
      current: formatted,
      older: [],
      lastUsed: {
        [formatted]: Date.now()
      },
      root: formatted
    };
    logger.info(`[data|get](dep: ${formatted}|version: ${version}|rootDependencyName: ${payload.rootDependencyName})`);

    await appCache.updatePayloadsList(payloadsList);
    appCache.updatePayload(formatted.replaceAll("/", "-"), payload);
    logger.info(`[data|get](cache: created|payloadsList: ${payloadsList.lru})`);

    send(res, 200, payload);
  }
}
