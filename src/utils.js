/**
 * @namespace Utils
 */

"use strict";

// Require Node.js Dependencies
const { readdir, stat } = require("fs").promises;
const { extname, join, relative } = require("path");

// SYMBOLS
const SYM_FILE = Symbol("symTypeFile");
const SYM_DIR = Symbol("symTypeDir");

// CONSTANTS
const EXCLUDE_DIRS = new Set(["node_modules", ".vscode", ".git"]);
const LICENSES = new Map([
    ["MIT", "MIT"],
    ["BSD", "BSD"],
    ["ISC ", "ISC"],
    ["Apache License", "Apache"],
    ["Mozilla", "Mozilla"],
    ["LGPL", "LGPL"],
    ["Affero", "GPL"],
    ["GPL", "GPL"],
    ["Eclipse", "Eclipse"],
    ["Artistic", "Artistic"],
    ["DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE", "WTF"]
]);
const REGISTRY_DEFAULT_ADDR = "https://registry.npmjs.org/";

// VARS
let localNPMRegistry = null;

// TYPEDEF

/**
 * @typedef {object} mergedDep
 * @property {Map<string, string>} dependencies
 * @property {Map<string, string>} customResolvers
 */

/**
 * @typedef {object} tarballComposition
 * @property {Set<string>} ext all files extension
 * @property {number} size size in bytes
 * @property {string[]} files complete list of files retrieved in the tarball
 */

/**
 * @async
 * @generator
 * @function getFilesRecursive
 * @memberof Utils#
 * @param {!string} dir root directory
 * @returns {AsyncIterableIterator<string>}
 */
async function* getFilesRecursive(dir) {
    const dirents = await readdir(dir, { withFileTypes: true });

    for (const dirent of dirents) {
        if (EXCLUDE_DIRS.has(dirent.name)) {
            continue;
        }

        if (dirent.isFile()) {
            yield [SYM_FILE, join(dir, dirent.name)];
        }
        else if (dirent.isDirectory()) {
            const fullPath = join(dir, dirent.name);
            yield [SYM_DIR, fullPath];
            yield* getFilesRecursive(fullPath);
        }
    }
}

/**
 * @async
 * @function getTarballComposition
 * @description Get the size and the file(s) and directorie(s) composition of a given extracted npm tarball
 * @memberof Utils#
 * @param {!string} tarballDir tarball dir
 * @returns {Promise<tarballComposition>}
 */
async function getTarballComposition(tarballDir) {
    const ext = new Set();
    const files = [];
    const dirs = [];
    let size = (await stat(tarballDir)).size;

    for await (const [kind, file] of getFilesRecursive(tarballDir)) {
        switch (kind) {
            case SYM_FILE:
                ext.add(extname(file));
                files.push(file);
                break;
            case SYM_DIR:
                dirs.push(file);
                break;
        }
    }

    try {
        const sizeAll = await Promise.all([
            ...files.map((file) => stat(file)),
            ...dirs.map((file) => stat(file))
        ]);
        size += sizeAll.reduce((prev, curr) => prev + curr.size, 0);
    }
    catch (err) {
        // ignore
    }

    return { ext, size, files: files.map((path) => relative(tarballDir, path)) };
}

/**
 * @function mergeDependencies
 * @description Merge all kinds (dep, devDep etc..) of dependencies section of npm Manifest (package.json)
 * @memberof Utils#
 * @param {!object} manifest manifest
 * @param {string[]} [types] dependencies types to merge
 * @returns {mergedDep}
 */
function mergeDependencies(manifest, types = ["dependencies"]) {
    const dependencies = new Map();
    const customResolvers = new Map();

    for (const fieldName of types) {
        if (!Reflect.has(manifest, fieldName)) {
            continue;
        }
        const dep = manifest[fieldName];

        for (const [name, version] of Object.entries(dep)) {
            // Version can be file:, github:, git+, ./...
            if (/^([a-zA-Z]+:|git\+|\.\\)/.test(version)) {
                customResolvers.set(name, version);
                continue;
            }

            dependencies.set(name, version);
        }
    }

    return { dependencies, customResolvers };
}

/**
 * @function getLicenseFromString
 * @memberof Utils#
 * @param {!string} str license file content
 * @returns {string}
 */
function getLicenseFromString(str) {
    for (const [name, licenseName] of LICENSES.entries()) {
        if (str.indexOf(name) > -1) {
            return licenseName;
        }
    }

    return "Unknown License";
}

/**
 * @function cleanRange
 * @description Clean up range (as possible).
 * @memberof Utils#
 * @param {!string} version version
 * @returns {string}
 *
 * @example
 * const assert = require("assert").strict;
 *
 * const ret = cleanRange("^1.0.0");
 * assert.equal(ret, "1.0.0");
 *
 * @see https://github.com/npm/node-semver#ranges
 */
function cleanRange(version) {
    // TODO: how do we handle complicated range like pkg-name@1 || 2 or pkg-name@2.1.2 < 3
    const firstChar = version.charAt(0);
    if (firstChar === "^" || firstChar === "<" || firstChar === ">" || firstChar === "=" || firstChar === "~") {
        return version.slice(version.charAt(1) === "=" ? 2 : 1);
    }

    return version;
}

/**
 * @function getRegistryURL
 * @description retrieve the local npm registry URL (or return the default registry url if there is nothing in local).
 * @memberof Utils#
 * @param {boolean} [force=false] force spawn execution
 * @returns {string}
 */
function getRegistryURL(force = false) {
    if (localNPMRegistry !== null && !force) {
        return localNPMRegistry;
    }

    try {
        const { stdout = REGISTRY_DEFAULT_ADDR } = spawnSync(
            `npm${process.platform === "win32" ? ".cmd" : ""}`, ["config", "get", "registry"]);
        localNPMRegistry = stdout.trim() === "" ? REGISTRY_DEFAULT_ADDR : stdout;

        return localNPMRegistry;
    }
    catch (error) {
        return REGISTRY_DEFAULT_ADDR;
    }
}

module.exports = Object.freeze({
    getFilesRecursive,
    getTarballComposition,
    mergeDependencies,
    getLicenseFromString,
    cleanRange,
    getRegistryURL,
    constants: Object.freeze({
        FILE: SYM_FILE,
        DIRECTORY: SYM_DIR
    })
});
