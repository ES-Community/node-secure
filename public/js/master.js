"use strict";

// CONSTANTS (for nodes colors)
const C_MAIN = "#01579B";
const C_INDIRECT = "rgba(100, 200, 200, 0.30)";
const C_WARN = "rgba(210, 115, 115, 0.30)";
const C_NORMAL = "rgba(150, 200, 200, 0.15)";
const C_SELECTED = "rgba(170, 100, 200, 0.50)";
const C_TRS = "rgba(150, 150, 150, 0.02)";

const networkGraphOptions = {
    nodes: {
        mass: 6,
        shape: "box",
        size: 5,
        font: {
            face: "Roboto",
            vadjust: 1,
            size: 34,
            color: "#ECEFF1",
            bold: {
                face: "Roboto",
                color: "#F9FBE7"
            }
        },
        margin: 14,
        shadow: {
            enabled: true,
            color: "rgba(20, 20, 20, 0.2)"
        }
    },
    edges: {
        arrows: "from",
        hoverWidth: 3,
        selectionWidth: 3,
        width: 2
    },
    physics: {
        forceAtlas2Based: {
            gravitationalConstant: -26,
            centralGravity: 0.005,
            springLength: 230,
            springConstant: 0.18
        },
        maxVelocity: 150,
        solver: "forceAtlas2Based",
        timestep: 0.35,
        stabilization: { iterations: 150 }
    }
};

const FLAGS = {
    "🌍": "The package has indirect dependencies.",
    "⚠️": "The package has suspicious imports.",
    "💎": "The package has dependencies that are not packages.",
    "📜": "The package does not seem to have a license.",
    "🔬": "The package seems to have files that are minified/uglified.",
    "⛔️": "The package is deprecated.",
    "💕": "The package has several publishers.",
    "👥": "The author has already changed at least one time."
}

function getColor(id, flags) {
    if (id === 0) {
        return C_MAIN;
    }
    else if (flags.hasSuspectImport || flags.hasMinifiedCode) {
        return C_WARN;
    }
    else if (flags.hasIndirectDependencies) {
        return C_INDIRECT;
    }

    return C_NORMAL;
}

function getFlags(flags, metadata) {
    const flagList = [];
    if (flags.hasIndirectDependencies) {
        flagList.push("🌍");
    }
    if (flags.hasSuspectImport) {
        flagList.push("⚠️");
    }
    if (flags.hasCustomResolver) {
        flagList.push("💎");
    }
    if (flags.hasLicense === false) {
        flagList.push("📜");
    }
    if (flags.hasMinifiedCode) {
        flagList.push("🔬");
    }
    if (flags.isDeprecated) {
        flagList.push("⛔️");
    }
    if (metadata.hasManyPublishers) {
        flagList.push("💕");
    }
    if (metadata.hasChangedAuthor) {
        flagList.push("👥");
    }
    return flagList;
}

function getFlagStr(flagList) {
    return flagList.reduce((acc, cur) => `${acc} ${cur}`, "")
}

document.addEventListener("DOMContentLoaded", async() => {
    // Find elements and declare top vars
    const networkElement = document.getElementById("network-graph");
    let highlightActive = false;

    // Hydrate nodes & edges with the data
    const nodesDataArr = [];
    const edgesDataArr = [];
    const linker = new Map();

    const data = await request("/data");
    for (const [packageName, descriptor] of Object.entries(data)) {
        const { metadata, ...versions } = descriptor;

        for (const [currVersion, opt] of Object.entries(versions)) {
            const { id, usedBy, flags, size } = opt;
            opt.name = packageName;
            opt.version = currVersion;

            const label = `${packageName}@${currVersion}${getFlagStr(getFlags(flags, metadata))}\n<b>[${formatBytes(size)}]</b>`;
            const color = getColor(id, flags);

            linker.set(Number(id), opt);
            nodesDataArr.push({ id, label, color, font: { multi: "html" } });

            for (const [name, version] of Object.entries(usedBy)) {
                edgesDataArr.push({ from: id, to: data[name][version].id });
            }
        }
    }

    // Create required DataSet for the Network Graph
    const nodes = new vis.DataSet(nodesDataArr);
    const edges = new vis.DataSet(edgesDataArr);

    // Initialize vis Network
    const network = new vis.Network(networkElement, { nodes, edges }, networkGraphOptions);
    network.on("click", neighbourHighlight);
    network.on("click", updateMenu);

    async function updateMenu(params) {
        const showInfoElem = document.getElementById("show-info");
        const packageInfoTemplate = document.getElementById("package-info");

        if (params.nodes.length > 0) {
            showInfoElem.innerHTML = "";

            const clone = document.importNode(packageInfoTemplate.content, true);
            const currentNode = params.nodes[0];
            const selectedNode = linker.get(Number(currentNode));
            const { name, version, author, flags } = selectedNode;
            const metadata = data[name].metadata;

            clone.querySelector(".name").textContent = name;
            clone.querySelector(".version").textContent = version;
            clone.querySelector(".desc").textContent = selectedNode.description;

            // eslint-disable-next-line
            let fAuthor = typeof author === "string" ? author : (author.name || "Unknown");
            fAuthor = fAuthor.length > 26 ? `${fAuthor.slice(0, 26)}...` : fAuthor;

            // eslint-disable-next-line
            const lastUpdate = Intl.DateTimeFormat("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "numeric",
                minute: "numeric",
                second: "numeric"
            }).format(new Date(metadata.lastUpdateAt));

            const fields = clone.querySelector(".fields");
            const fieldsFragment = document.createDocumentFragment();
            fieldsFragment.appendChild(createLiField("Author", fAuthor));
            fieldsFragment.appendChild(createLiField(`License (${selectedNode.licenseFrom})`, selectedNode.license));
            fieldsFragment.appendChild(createLiField("Size on system", formatBytes(selectedNode.size)));
            fieldsFragment.appendChild(createLiField("Home", metadata.homepage || "N/A", true));
            fieldsFragment.appendChild(createLiField("Last release", metadata.lastVersion));
            fieldsFragment.appendChild(createLiField("Last release (date)", lastUpdate));
            fieldsFragment.appendChild(createLiField("Number of published releases", metadata.publishedCount));
            fields.appendChild(fieldsFragment);

            clone.querySelector(".flags").textContent = getFlagStr(getFlags(flags, metadata)) || 'No specific flag'

            try {
                const {
                    gzip, size, dependencySizes
                } = await request(`https://bundlephobia.com/api/size?package=${name}@${version}`);
                const fullSize = dependencySizes.reduce((prev, curr) => prev + curr.approximateSize, 0);

                clone.querySelector(".size-gzip").textContent = formatBytes(gzip);
                clone.querySelector(".size-min").textContent = formatBytes(size);
                clone.querySelector(".size-full").textContent = formatBytes(fullSize);
            }
            catch (err) {
                // ignore
            }

            showInfoElem.appendChild(clone);
        }
        else {
            showInfoElem.innerHTML = "<div class=\"select-project\"><p>SELECT A PROJECT!</p></div>";
        }
    }

    function neighbourHighlight(params) {
        const allNodes = nodes.get({ returnType: "Object" });

        // if something is selected:
        if (params.nodes.length > 0) {
            highlightActive = true;
            const selectedNode = params.nodes[0];

            // mark all nodes as hard to read.
            for (const node of Object.values(allNodes)) {
                node.color = C_TRS;
            }

            // get the second degree nodes
            const connectedNodes = network.getConnectedNodes(selectedNode);
            const allConnectedNodes = [];
            for (let id = 0; id < connectedNodes.length; id++) {
                allConnectedNodes.push(...network.getConnectedNodes(connectedNodes[id]));
            }

            // all second degree nodes get a different color and their label back
            for (let id = 0; id < allConnectedNodes.length; id++) {
                allNodes[allConnectedNodes[id]].color = C_NORMAL;
            }

            // all first degree nodes get their own color and their label back
            for (let id = 0; id < connectedNodes.length; id++) {
                allNodes[connectedNodes[id]].color = C_SELECTED;
            }

            // the main node gets its own color and its label back.
            allNodes[selectedNode].color = C_MAIN;
        }
        else if (highlightActive) {
            highlightActive = false;
            for (const node of Object.values(allNodes)) {
                const { id, flags } = linker.get(Number(node.id));
                node.color = getColor(id, flags);
            }
        }

        // transform the object into an array
        nodes.update(Object.values(allNodes));
    }
});
