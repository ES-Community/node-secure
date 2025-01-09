// Import Node.js Dependencies
import fs from "node:fs";

// Import Internal Dependencies
import { appCache, DEFAULT_PAYLOAD_PATH } from "./cache.js";
import { logger } from "./logger.js";

// CONSTANTS
const kDefaultConfig = {
  defaultPackageMenu: "info",
  ignore: { flags: [], warnings: [] },
  standalone: false
};

export async function get() {
  try {
    const config = await appCache.getConfig();

    let standalone = false;
    const standalonePayload = await appCache.getStandalonePayload();
    if (standalonePayload && fs.existsSync(DEFAULT_PAYLOAD_PATH)) {
      const localPayload = JSON.parse(fs.readFileSync(DEFAULT_PAYLOAD_PATH, "utf-8"));
      if (localPayload.id === standalonePayload.id) {
        standalone = true;
      }
    }
    appCache.isStandalone = standalone;
    Object.assign(config, { standalone });

    const {
      defaultPackageMenu,
      ignore: {
        flags,
        warnings
      } = {}
    } = config;
    logger.info(
      `[config|get](defaultPackageMenu: ${defaultPackageMenu}|flags: ${flags}|warnings: ${warnings}|standalone: ${standalone})`
    );

    return config;
  }
  catch (err) {
    logger.error(`[config|get](error: ${err.message})`);

    await appCache.updateConfig(kDefaultConfig);

    logger.info(`[config|get](fallback to default: ${JSON.stringify(kDefaultConfig)})`);

    return kDefaultConfig;
  }
}

export async function set(newValue) {
  logger.info(`[config|set](config: ${newValue})`);
  try {
    await appCache.updateConfig(newValue);

    logger.info(`[config|set](sucess)`);
  }
  catch (err) {
    logger.error(`[config|set](error: ${err.message})`);

    throw err;
  }
}
