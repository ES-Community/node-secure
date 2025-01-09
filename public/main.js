// Import Third-party Dependencies
import { NodeSecureDataSet, NodeSecureNetwork } from "@nodesecure/vis-network";

// Import UI Components
import { PackageInfo } from "./components/package/package.js";
import { ViewNavigation } from "./components/navigation/navigation.js";
import { Wiki } from "./components/wiki/wiki.js";
import { Popup } from "./components/popup/popup.js";
import { Locker } from "./components/locker/locker.js";
import { Legend } from "./components/legend/legend.js";

// Import Views Components
import { Settings } from "./components/views/settings/settings.js";
import { HomeView } from "./components/views/home/home.js";
import { SearchView } from "./components/views/search/search.js";

// Import Core Components
import { NetworkNavigation } from "./core/network-navigation.js";
import { i18n } from "./core/i18n.js";
import { initSearchNav } from "./core/search-nav.js";

// Import Utils
import * as utils from "./common/utils.js";

let secureDataSet;
let nsn;
let searchview;
let packageInfoOpened = false;

document.addEventListener("DOMContentLoaded", async() => {
  window.scannedPackageCache = [];
  window.locker = null;
  window.popup = new Popup();
  window.navigation = new ViewNavigation();
  window.settings = await new Settings().fetchUserConfig();
  if (window.settings.config.standalone) {
    console.log(`[INFO] Standalone mode activated`);
    window.navigation.hideMenu("search--view", { navigateAway: true });
  }
  window.i18n = await new i18n().fetch();
  window.wiki = new Wiki();

  await init();
  onSettingsSaved();

  window.socket = new WebSocket(`ws://${window.location.hostname}:1338`);
  window.socket.addEventListener("message", async(event) => {
    const data = JSON.parse(event.data);
    console.log(`[WEBSOCKET] data status = '${data.status || "NONE"}'`);

    if (data.rootDependencyName) {
      window.activePackage = data.rootDependencyName;
      await init({ navigateToNetworkView: true });
      initSearchNav(data, {
        initFromZero: false,
        searchOptions: {
          nsn, secureDataSet
        }
      });
    }
    else if (data.status === "INIT" || data.status === "RELOAD") {
      window.scannedPackageCache = data.older;
      console.log(
        "[INFO] Older packages are loaded!",
        window.scannedPackageCache
      );

      initSearchNav(data, {
        searchOptions: {
          nsn, secureDataSet
        }
      });
      searchview.reset();
      const nsnActivePackage = secureDataSet.linker.get(0);
      const nsnRootPackage = nsnActivePackage ? `${nsnActivePackage.name}@${nsnActivePackage.version}` : null;
      if (data.status === "RELOAD" && nsnRootPackage !== null && nsnRootPackage !== window.activePackage) {
        // it means we removed the previous active package, which is still active in network, so we need to re-init
        await init();

        // FIXME: initSearchNav is called twice, we need to fix this
        initSearchNav(data, {
          searchOptions: {
            nsn, secureDataSet
          }
        });
      }
    }
    else if (data.status === "SCAN") {
      searchview.onScan(data.pkg);
    }
  });

  window.onbeforeunload = () => {
    window.socket.onclose = () => void 0;
    window.socket.close();
  };
});

async function init(options = {}) {
  const { navigateToNetworkView = false } = options;

  secureDataSet = new NodeSecureDataSet({
    flagsToIgnore: window.settings.config.ignore.flags,
    warningsToIgnore: window.settings.config.ignore.warnings
  });
  await secureDataSet.init();

  window.vulnerabilityStrategy = secureDataSet.data.vulnerabilityStrategy;

  // Initialize vis Network
  NodeSecureNetwork.networkElementId = "dependency-graph";
  nsn = new NodeSecureNetwork(secureDataSet, { i18n: window.i18n[utils.currentLang()] });
  window.locker = new Locker(nsn);
  window.legend = new Legend({ show: window.settings.config.showFriendlyDependencies });
  new HomeView(secureDataSet, nsn);
  if (window.settings.config.standalone) {
    window.activePackage = secureDataSet.data.rootDependencyName;
    initSearchNav(void 0, {
      initSinglePackage: secureDataSet.data.rootDependencyName,
      searchOptions: {
        nsn, secureDataSet
      }
    });
  }
  else {
    searchview ??= new SearchView(secureDataSet, nsn);
  }

  window.addEventListener("package-info-closed", () => {
    window.networkNav.currentNodeParams = null;
    packageInfoOpened = false;
  });

  nsn.network.on("click", updateShowInfoMenu);

  const networkNavigation = new NetworkNavigation(secureDataSet, nsn);
  window.networkNav = networkNavigation;

  if (navigateToNetworkView) {
    window.navigation.setNavByName("network--view");
  }

  // update search nav
  const pkgs = document.querySelectorAll("#search-nav .packages > .package");
  for (const pkg of pkgs) {
    if (pkg.dataset.name.startsWith(window.activePackage)) {
      pkg.classList.add("active");
    }
    else {
      pkg.classList.remove("active");
    }
  }

  PackageInfo.close();

  console.log("[INFO] Node-Secure is ready!");
}

function getNodeLevel(node) {
  const rootNode = secureDataSet.linker.get(0);
  if (node.id === rootNode.id) {
    return 0;
  }

  let level = 1;
  let currentNode = node;
  while (currentNode.usedBy[rootNode.name] === undefined) {
    currentNode = secureDataSet.linker.get(
      [...secureDataSet.linker].find(([_, { name }]) => Object.keys(currentNode.usedBy)[0] === name)[0]
    );
    level++;
  }

  return level;
}

async function updateShowInfoMenu(params) {
  if (params.nodes.length === 0) {
    window.networkNav.currentNodeParams = null;

    return PackageInfo.close();
  }

  if (window.networkNav.currentNodeParams?.nodes[0] === params.nodes[0] && packageInfoOpened === true) {
    return void 0;
  }

  packageInfoOpened = true;
  window.networkNav.currentNodeParams = params;
  const currentNode = window.networkNav.currentNodeParams.nodes[0];
  const selectedNode = secureDataSet.linker.get(
    Number(currentNode)
  );
  const selectedNodeLevel = getNodeLevel(selectedNode);

  window.networkNav.setLevel(selectedNodeLevel);
  if (window.networkNav.dependenciesMapByLevel.get(selectedNodeLevel) === undefined) {
    window.networkNav.dependenciesMapByLevel.set(selectedNodeLevel, params);
  }

  new PackageInfo(selectedNode, currentNode, secureDataSet.data.dependencies[selectedNode.name], nsn);

  return void 0;
}

function onSettingsSaved() {
  window.addEventListener("settings-saved", async(event) => {
    const warningsToIgnore = new Set(event.detail.ignore.warnings);
    const flagsToIgnore = new Set(event.detail.ignore.flags);
    secureDataSet.warningsToIgnore = warningsToIgnore;
    secureDataSet.flagsToIgnore = flagsToIgnore;
    window.settings.config.ignore.warnings = warningsToIgnore;
    window.settings.config.ignore.flags = flagsToIgnore;

    await secureDataSet.init(
      secureDataSet.data,
      secureDataSet.FLAGS
    );
    const { nodes } = secureDataSet.build();
    nsn.nodes.update(nodes.get());
    const rootNode = secureDataSet.linker.get(0);
    window.activePackage = rootNode.name;

    if (window.networkNav.currentNodeParams !== null) {
      window.navigation.setNavByName("network--view");
      nsn.neighbourHighlight(window.networkNav.currentNodeParams, window.i18n[utils.currentLang()]);
      updateShowInfoMenu(window.networkNav.currentNodeParams);
    }

    if (event.detail.showFriendlyDependencies) {
      window.legend.show();
    }
    else {
      window.legend.hide();
    }
  });
}
