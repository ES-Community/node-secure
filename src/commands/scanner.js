// Import Node.js Dependencies
import fs from "fs/promises";
import path from "path";
import events from "events";

// Import Third-party Dependencies
import kleur from "kleur";
import filenamify from "filenamify";
import Spinner from "@slimio/async-cli-spinner";
import ms from "ms";
import * as i18n from "@nodesecure/i18n";
import * as scanner from "@nodesecure/scanner";

// Import Internal Dependencies
import * as http from "./http.js";

Spinner.DEFAULT_SPINNER = "dots";

export async function auto(packageName, opts) {
  const keep = Boolean(opts.keep);
  delete opts.keep;
  delete opts.k;

  const payloadFile = await (typeof packageName === "string" ? from(packageName, opts) : cwd(opts));
  try {
    if (payloadFile !== null) {
      await http.start();
      await events.once(process, "SIGINT");
    }
  }
  finally {
    if (!keep && payloadFile !== null) {
      try {
        await fs.unlink(payloadFile);
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

export async function cwd(opts) {
  const { depth: maxDepth = 4, output, nolock, full, vulnerabilityStrategy } = opts;

  const payload = await scanner.cwd(
    process.cwd(),
    { maxDepth, usePackageLock: !nolock, fullLockMode: full, vulnerabilityStrategy },
    initLogger()
  );

  return await logAndWrite(payload, output);
}

export async function from(packageName, opts) {
  const { depth: maxDepth = 4, output } = opts;

  const payload = await scanner.from(packageName, { maxDepth }, initLogger(packageName));

  return await logAndWrite(payload, output);
}

function initLogger(packageName) {
  const spinner = {
    walkTree: new Spinner(),
    tarball: new Spinner(),
    registry: new Spinner(),
    fetchManifest: new Spinner(),
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

  const logger = new scanner.Logger();
  logger.on("start", (eventName) => {
    if (!(eventName in spinner)) {
      return;
    }

    if (eventName === "fetchManifest") {
      spinner[eventName]
        .start(kleur.white().bold(i18n.getToken(spinner.i18n.start[eventName], kleur.green().bold(packageName))));
    }
    else {
      spinner[eventName]
        .start(kleur.white().bold(i18n.getToken(spinner.i18n.start[eventName])));
    }
  });
  logger.on("tick", (eventName) => {
    if (!(eventName in spinner) || eventName === "walkTree") {
      return;
    }

    const stats = kleur.gray().bold(`[${kleur.yellow().bold(logger.count(eventName))}/${logger.count("walkTree")}]`);
    spinner[eventName].text = kleur.white().bold(`${i18n.getToken(spinner.i18n.tick[eventName])} ${stats}`);
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
        i18n.getToken(tokenName, kleur.yellow().bold(i18n.getToken("depWalker.dep_tree")), execTime)));
    }
    else if (eventName === "registry") {
      spin.succeed(kleur.white().bold(i18n.getToken(tokenName)));
    }
    else if (eventName === "tarball") {
      spin.succeed(kleur.white().bold(i18n.getToken(tokenName, kleur.green().bold(logger.count("walkTree")), execTime)));
    }
    else if (eventName === "fetchManifest") {
      spin.succeed(kleur.white().bold(i18n.getToken(tokenName, kleur.green().bold(packageName), execTime)));
      console.log("");
    }
  });

  return logger;
}

async function logAndWrite(payload, output = "nsecure-result") {
  if (payload === null) {
    console.log(i18n.getToken("cli.no_dep_to_proceed"));

    return null;
  }

  if (payload.warnings.length > 0) {
    console.log(`\n ${kleur.yellow().underline().bold("Global Warning:")}\n`);
    for (const warning of payload.warnings) {
      console.log(kleur.red().bold(warning));
    }
  }

  const ret = JSON.stringify(payload, null, 2);

  const fileName = path.extname(output) === ".json" ? filenamify(output) : `${filenamify(output)}.json`;
  const filePath = path.join(process.cwd(), fileName);
  await fs.writeFile(filePath, ret);

  console.log("");
  console.log(kleur.white().bold(i18n.getToken("cli.successfully_written_json", kleur.green().bold(filePath))));
  console.log("");

  return filePath;
}
