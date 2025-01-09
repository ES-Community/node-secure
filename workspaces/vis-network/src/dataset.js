// Import Third-party Dependencies
import prettyBytes from "pretty-bytes";
import { DataSet } from "vis-data";

// Import Internal Dependencies
import * as utils from "./utils.js";

export default class NodeSecureDataSet extends EventTarget {
  /**
   *
   * @param {object} [options]
   * @param {string[]} [options.flagsToIgnore=[]]
   * @param {string[]} [options.warningsToIgnore=[]]
   */
  constructor(options = {}) {
    super();
    const { flagsToIgnore = [], warningsToIgnore = [] } = options;

    this.flagsToIgnore = new Set(flagsToIgnore);
    this.warningsToIgnore = new Set(warningsToIgnore);
    this.reset();
  }

  get prettySize() {
    return prettyBytes(this.size);
  }

  reset() {
    this.warnings = [];
    this.packages = [];
    this.linker = new Map();
    this.authors = new Map();
    this.extensions = Object.create(null);
    this.licenses = { Unknown: 0 };

    this.rawNodesData = [];
    this.rawEdgesData = [];

    this.data = {};
    this.dependenciesCount = 0;
    this.size = 0;
    this.indirectDependencies = 0;
  }

  async init(
    initialPayload = null,
    initialFlags = {}
  ) {
    console.log("[NodeSecureDataSet] Initialization started...");
    let FLAGS;
    let data;
    this.reset();

    if (initialPayload) {
      data = initialPayload;
      FLAGS = initialFlags;
    }
    else {
      ([data, FLAGS] = await Promise.all([
        utils.getJSON("/data"), utils.getJSON("/flags")
      ]));
    }

    this.FLAGS = FLAGS;
    this.warnings = data.warnings;
    this.data = data;

    const dataEntries = Object.entries(data.dependencies);
    this.dependenciesCount = dataEntries.length;

    this.rawEdgesData = [];
    this.rawNodesData = [];

    const rootDependency = dataEntries.find(([name]) => name === data.rootDependencyName);
    const rootContributors = [
      rootDependency[1].metadata.author,
      ...rootDependency[1].metadata.maintainers,
      ...rootDependency[1].metadata.publishers
    ];
    for (const [packageName, descriptor] of dataEntries) {
      const contributors = [descriptor.metadata.author, ...descriptor.metadata.maintainers, ...descriptor.metadata.publishers];
      for (const [currVersion, opt] of Object.entries(descriptor.versions)) {
        const { id, usedBy, flags, size, uniqueLicenseIds, author, composition, warnings, links } = opt;
        const filteredWarnings = warnings
          .filter((row) => !this.warningsToIgnore.has(row.kind));
        const hasWarnings = filteredWarnings.length > 0;

        opt.name = packageName;
        opt.version = currVersion;
        opt.hidden = false;
        opt.hasWarnings = hasWarnings;

        this.computeExtension(composition.extensions);
        this.computeLicense(uniqueLicenseIds);
        this.computeAuthor(author, `${packageName}@${currVersion}`, contributors);

        if (flags.includes("hasIndirectDependencies")) {
          this.indirectDependencies++;
        }
        this.size += size;

        const flagStr = utils.getFlagsEmojisInlined(
          flags,
          hasWarnings ? this.flagsToIgnore : new Set([...this.flagsToIgnore, "hasWarnings"])
        );
        const isFriendly = window.settings.config.showFriendlyDependencies & rootContributors.some(
          (rootContributor) => contributors.some((contributor) => {
            if (contributor === null) {
              return false;
            }
            else if (contributor.email && contributor.email === rootContributor.email) {
              return true;
            }
            else if (contributor.name && contributor.name === rootContributor.name) {
              return true;
            }

            return false;
          })
        );
        opt.isFriendly = isFriendly;
        this.packages.push({
          id,
          name: packageName,
          version: currVersion,
          hasWarnings,
          flags: flagStr.replace(/\s/g, ""),
          links,
          isFriendly
        });

        const label = `<b>${packageName}@${currVersion}</b>${flagStr}\n<b>[${prettyBytes(size)}]</b>`;
        const color = utils.getNodeColor({
          id,
          hasWarnings,
          isFriendly
        });
        color.font.multi = "html";

        this.linker.set(Number(id), opt);
        this.rawNodesData.push(Object.assign({ id, label }, color));

        for (const [name, version] of Object.entries(usedBy)) {
          this.rawEdgesData.push({ from: id, to: data.dependencies[name].versions[version].id });
        }
      }
    }
    console.log("[NodeSecureDataSet] Initialization done!");
  }

  getAuthorByEmail(emailToMatch) {
    for (const [name, data] of this.authors.entries()) {
      if (data.email === emailToMatch) {
        return [name, data];
      }
    }

    return null;
  }

  computeExtension(extensions) {
    for (const extName of extensions) {
      if (extName !== "") {
        this.extensions[extName] = Reflect.has(this.extensions, extName) ? ++this.extensions[extName] : 1;
      }
    }
  }

  computeLicense(uniqueLicenseIds) {
    for (const licenseName of uniqueLicenseIds) {
      this.licenses[licenseName] = Reflect.has(this.licenses, licenseName) ? ++this.licenses[licenseName] : 1;
    }
  }

  computeAuthor(author, spec, contributors = []) {
    if (author === null) {
      return;
    }
    const contributor = contributors.find(
      (contributor) => contributor?.email === author.email && contributor?.npmAvatar !== null
    );

    if (this.authors.has(author.name)) {
      this.authors.get(author.name).packages.add(spec);
    }
    else {
      this.authors.set(
        author.name,
        Object.assign({}, author, { packages: new Set([spec]) })
      );
    }
    if (contributor && contributor.npmAvatar) {
      this.authors.get(author.name).npmAvatar = contributor.npmAvatar;
    }
  }

  build() {
    const nodes = new DataSet(this.rawNodesData);
    const edges = new DataSet(this.rawEdgesData);

    return { nodes, edges };
  }
}
