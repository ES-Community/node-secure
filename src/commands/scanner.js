// Import Node.js Dependencies
import fs from "node:fs";
import path from "node:path";
import events from "node:events";

// Import Third-party Dependencies
import kleur from "kleur";
import filenamify from "filenamify";
import { Spinner } from "@topcli/spinner";
import ms from "ms";
import * as i18n from "@nodesecure/i18n";
import * as Scanner from "@nodesecure/scanner";

// Import Internal Dependencies
import * as http from "./http.js";
import { appCache } from "../http-server/cache.js";

export async function auto(spec, options) {
  const { keep, ...commandOptions } = options;

  const payloadFile = await (
    typeof spec === "string" ?
      from(spec, commandOptions) :
      cwd(commandOptions)
  );
  try {
    if (payloadFile !== null) {
      await http.start();
      await events.once(process, "SIGINT");
    }
  }
  finally {
    if (!keep && payloadFile !== null) {
      try {
        fs.unlinkSync(payloadFile);
      }
      catch (error) {
        if (error.code !== "ENOENT") {
          // eslint-disable-next-line no-unsafe-finally
          throw error;
        }
      }
    }
  }
}

export async function cwd(options) {
  const {
    depth: maxDepth = Infinity,
    output,
    nolock,
    full,
    vulnerabilityStrategy,
    silent
  } = options;

  const payload = await Scanner.cwd(
    process.cwd(),
    { maxDepth, usePackageLock: !nolock, fullLockMode: full, vulnerabilityStrategy },
    initLogger(void 0, !silent)
  );

  return logAndWrite(payload, output, { lockUi: true });
}

export async function from(spec, options) {
  const { depth: maxDepth = Infinity, output, silent } = options;

  const payload = await Scanner.from(
    spec,
    { maxDepth },
    initLogger(spec, !silent)
  );

  return logAndWrite(payload, output);
}

function initLogger(spec, verbose = true) {
  const spinner = {
    walkTree: new Spinner({ verbose }),
    tarball: new Spinner({ verbose }),
    registry: new Spinner({ verbose }),
    fetchManifest: new Spinner({ verbose }),
    i18n: {
      start: {
        fetchManifest: "cli.commands.from.searching",
        walkTree: "depWalker.fetch_and_walk_deps",
        tarball: "depWalker.waiting_tarball",
        registry: "depWalker.fetch_on_registry"
      },
      tick: {
        tarball: "depWalker.fetch_metadata",
        registry: "depWalker.fetch_on_registry"
      },
      end: {
        fetchManifest: "cli.commands.from.fetched",
        walkTree: "depWalker.success_fetch_deptree",
        tarball: "depWalker.success_tarball",
        registry: "depWalker.success_registry_metadata"
      }
    }
  };

  const logger = new Scanner.Logger();
  logger.on("start", (eventName) => {
    if (!(eventName in spinner)) {
      return;
    }

    if (eventName === "fetchManifest") {
      spinner[eventName]
        .start(kleur.white().bold(i18n.getTokenSync(spinner.i18n.start[eventName], kleur.green().bold(spec))));
    }
    else {
      spinner[eventName]
        .start(kleur.white().bold(i18n.getTokenSync(spinner.i18n.start[eventName])));
    }
  });

  logger.on("tick", (eventName) => {
    if (!(eventName in spinner) || eventName === "walkTree") {
      return;
    }

    const stats = kleur.gray().bold(`[${kleur.yellow().bold(logger.count(eventName))}/${logger.count("walkTree")}]`);
    spinner[eventName].text = kleur.white().bold(`${i18n.getTokenSync(spinner.i18n.tick[eventName])} ${stats}`);
  });

  logger.on("end", (eventName) => {
    if (!(eventName in spinner)) {
      return;
    }

    const spin = spinner[eventName];
    const tokenName = spinner.i18n.end[eventName];
    const execTime = kleur.cyan().bold(ms(Number(spin.elapsedTime.toFixed(2))));

    if (eventName === "walkTree") {
      spin.succeed(kleur.white().bold(
        i18n.getTokenSync(tokenName, kleur.yellow().bold(i18n.getTokenSync("depWalker.dep_tree")), execTime)));
    }
    else if (eventName === "registry") {
      spin.succeed(kleur.white().bold(i18n.getTokenSync(tokenName)));
    }
    else if (eventName === "tarball") {
      spin.succeed(kleur.white().bold(i18n.getTokenSync(tokenName, kleur.green().bold(logger.count("walkTree")), execTime)));
    }
    else if (eventName === "fetchManifest") {
      spin.succeed(kleur.white().bold(i18n.getTokenSync(tokenName, kleur.green().bold(spec), execTime)));
      console.log("");
    }
  });

  return logger;
}

function logAndWrite(payload, output = "nsecure-result", options = {}) {
  const {
    lockUi = false
  } = options;

  if (payload === null) {
    console.log(i18n.getTokenSync("cli.no_dep_to_proceed"));

    return null;
  }

  if (payload.warnings.length > 0) {
    console.log(`\n ${kleur.yellow().underline().bold("Global Warning:")}\n`);
    for (const warning of payload.warnings) {
      console.log(kleur.red().bold(warning));
    }
  }

  const ret = JSON.stringify(payload, null, 2);

  const fileName = path.extname(output) === ".json" ?
    filenamify(output) :
    `${filenamify(output)}.json`;
  const filePath = path.join(process.cwd(), fileName);
  fs.writeFileSync(filePath, ret);

  console.log("");
  console.log(kleur.white().bold(i18n.getTokenSync("cli.successfully_written_json", kleur.green().bold(filePath))));
  console.log("");

  if (lockUi) {
    appCache.setStandalonePayload(payload);
  }

  return filePath;
}
