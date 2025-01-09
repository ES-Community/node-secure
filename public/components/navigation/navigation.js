// Import Internal Dependencies
import { PackageInfo } from "../package/package.js";

// CONSTANTS
const kAvailableView = new Set([
  "network--view",
  "home--view",
  "search--view",
  "settings--view"
]);

export class ViewNavigation {
  static DefaultActiveMenu = "network--view";

  constructor() {
    this.activeMenu = null;
    this.menus = new Map();

    const defaultMenu = this.getAnchor();
    const navElements = document.querySelectorAll("#view-navigation li");
    for (const navigationMenu of navElements) {
      const menuName = navigationMenu.getAttribute("data-menu");
      this.menus.set(menuName, navigationMenu);

      if (menuName === defaultMenu) {
        this.setNewActiveMenu(navigationMenu);
      }

      navigationMenu.addEventListener("click", () => this.onNavigationSelected(navigationMenu));
    }

    document.addEventListener("keydown", (event) => {
      const isWikiOpen = document.getElementById("documentation-root-element").classList.contains("slide-in");
      const isTargetPopup = event.target.id === "popup--background";
      const isTargetInput = event.target.tagName === "INPUT";
      if (isTargetPopup || isWikiOpen || isTargetInput) {
        return;
      }

      const hotkeys = JSON.parse(localStorage.getItem("hotkeys"));
      switch (event.key.toUpperCase()) {
        case hotkeys.home: {
          this.onNavigationSelected(this.menus.get("home--view"));
          break;
        }
        case hotkeys.network: {
          this.onNavigationSelected(this.menus.get("network--view"));
          break;
        }
        case hotkeys.settings: {
          this.onNavigationSelected(this.menus.get("settings--view"));
          break;
        }
        case hotkeys.search: {
          this.onNavigationSelected(this.menus.get("search--view"));
          break;
        }
      }
    });
  }

  setNavByName(navName) {
    this.onNavigationSelected(this.menus.get(navName));
  }

  /**
   * @param {!HTMLElement} selectedNav
   */
  setNewActiveMenu(selectedNav) {
    const menuName = selectedNav.getAttribute("data-menu");

    document.getElementById(menuName).classList.remove("hidden");
    selectedNav.classList.add("active");
    this.setAnchor(menuName);

    const searchbar = document.getElementById("searchbar");
    if (searchbar) {
      searchbar.style.display = menuName === "network--view" ? "flex" : "none";
    }

    this.activeMenu = selectedNav;
  }

  disableActiveMenu() {
    const menuName = this.activeMenu.getAttribute("data-menu");
    const view = document.getElementById(menuName);

    this.activeMenu.classList.remove("active");
    view.classList.add("hidden");
  }

  getAnchor() {
    const documentURL = new URL(document.URL);
    const anchorName = documentURL.searchParams.get("view") ?? ViewNavigation.DefaultActiveMenu;

    return kAvailableView.has(anchorName) ? anchorName : ViewNavigation.DefaultActiveMenu;
  }

  setAnchor(anchorName) {
    const newDocumentURL = new URL(document.URL);
    newDocumentURL.searchParams.set("view", anchorName);

    window.history.replaceState(void 0, void 0, newDocumentURL);
  }

  /**
   * @param {!HTMLElement} selectedNav
   */
  onNavigationSelected(selectedNav) {
    if (!selectedNav.classList.contains("active")) {
      PackageInfo.close();

      this.disableActiveMenu();
      this.setNewActiveMenu(selectedNav);
    }
  }

  hideMenu(menuName, options = {}) {
    const { navigateAway = false } = options;

    const menu = this.menus.get(menuName);
    if (!menu) {
      return;
    }

    menu.classList.add("hidden");

    if (navigateAway && this.activeMenu.isEqualNode(menu)) {
      this.setNavByName("network--view");
    }
  }
}
