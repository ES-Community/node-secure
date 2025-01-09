// Import Internal Dependencies
import { createDOMElement, parseNpmSpec } from "../common/utils";
import { SearchBar } from "../components/searchbar/searchbar";

export function initSearchNav(data, options) {
  const { initFromZero = true, searchOptions = null, initSinglePackage } = options;

  const searchNavElement = document.getElementById("search-nav");
  if (!searchNavElement) {
    throw new Error("Unable to found search navigation");
  }

  if (initSinglePackage) {
    searchNavElement.innerHTML = "";
    searchNavElement.appendChild(
      initSingleNavigation(initSinglePackage)
    );
  }
  else if (initFromZero) {
    searchNavElement.innerHTML = "";
    searchNavElement.appendChild(
      initPackagesNavigation(data)
    );
  }

  if (searchOptions !== null) {
    const { nsn, secureDataSet } = searchOptions;

    if (window.searchbar) {
      console.log("[SEARCH-NAV] cleanup searchbar");
      document.getElementById("searchbar")?.remove();
    }

    const searchElement = document.getElementById("searchbar-content");
    searchNavElement.appendChild(
      searchElement.content.cloneNode(true)
    );

    const searchBarPackagesContainer = document.getElementById("package-list");
    for (const info of secureDataSet.packages) {
      const content = `<p>${info.flags} ${info.name}</p><b>${info.version}</b>`;
      searchBarPackagesContainer.insertAdjacentHTML(
        "beforeend",
        `<div class="package hide" data-value="${info.id}">${content}</div>`
      );
    }
    window.searchbar = new SearchBar(nsn, secureDataSet.linker);
  }
}

function initPackagesNavigation(data) {
  const fragment = document.createDocumentFragment();
  const packages = data.lru;

  const hasAtLeast2Packages = packages.length > 1;
  const hasExactly2Packages = packages.length === 2;
  const container = createDOMElement("div", {
    classList: ["packages"]
  });

  for (const pkg of packages) {
    const { name, version } = parseNpmSpec(pkg);

    const pkgElement = createDOMElement("div", {
      classList: ["package"],
      childs: [
        createDOMElement("p", { text: name }),
        createDOMElement("b", { text: `v${version}` })
      ]
    });
    pkgElement.dataset.name = pkg;
    if (pkg === data.current) {
      window.activePackage = pkg;
      pkgElement.classList.add("active");
    }
    pkgElement.addEventListener("click", () => {
      if (window.activePackage !== pkg) {
        window.socket.send(JSON.stringify({ pkg, action: "SEARCH" }));
      }
    });

    if (hasAtLeast2Packages && pkg !== data.root) {
      pkgElement.appendChild(
        renderPackageRemoveButton(pkgElement.dataset.name, { hasExactly2Packages })
      );
    }

    container.appendChild(pkgElement);
  }

  const plusButtonElement = createDOMElement("button", {
    classList: ["add"],
    childs: [
      createDOMElement("p", { text: "+" })
    ]
  });
  plusButtonElement.addEventListener("click", () => {
    window.navigation.setNavByName("search--view");
  });

  fragment.append(container, plusButtonElement);

  return fragment;
}

function renderPackageRemoveButton(packageName, options) {
  const {
    hasExactly2Packages
  } = options;

  // we allow to remove a package when at least 2 packages are present
  const removeButton = createDOMElement("button", {
    classList: ["remove"],
    text: "x"
  });

  removeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    window.socket.send(JSON.stringify({ action: "REMOVE", pkg: packageName }));

    if (hasExactly2Packages) {
      document
        .getElementById("search-nav")
        .querySelectorAll(".package")
        .forEach((element) => element.querySelector(".remove")?.remove());
    }
  }, { once: true });

  return removeButton;
}

function initSingleNavigation(packageName) {
  const fragment = document.createDocumentFragment();
  const container = createDOMElement("div", {
    classList: ["packages"]
  });

  const pkgElement = createDOMElement("div", {
    classList: ["package"],
    childs: [
      createDOMElement("p", { text: packageName })
    ]
  });
  pkgElement.dataset.name = packageName;

  container.appendChild(pkgElement);
  fragment.append(container);

  return fragment;
}
