// Import Internal Dependencies
import { appCache } from "../cache.js";
import { logger } from "../logger.js";

export async function init(socket, lock = false) {
  if (appCache.isStandalone) {
    return;
  }

  try {
    const { current, lru, older, root } = await appCache.payloadsList();
    logger.info(`[ws|init](lru: ${lru}|older: ${older}|current: ${current}|root: ${root})`);

    if (lru === void 0 || current === void 0) {
      throw new Error("Payloads list not found in cache.");
    }

    socket.send(JSON.stringify({
      status: "INIT",
      current,
      lru,
      older,
      root
    }));
  }
  catch {
    logger.error(`[ws|init](No cache yet. Creating one...)`);

    if (lock) {
      return;
    }

    await appCache.initPayloadsList();

    init(socket, true);
  }
}
