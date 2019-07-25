# node-secure
[![build status][travis-image]][travis-url]
[![Test coverage][codecov-image]][codecov-url]

Node.js security CLI. The goal of the project is to a design a CLI that will allow to fetch all dependencies of a given package (or the package at the current working dir if there is a package.json to read) and draw a Network of all dependencies in a webpage.

- [Google Drive Documentation](https://docs.google.com/document/d/1853Uwup9mityAYqAOnen1KSqSA6hlBgpKU0u0ygGY4Y/edit?usp=sharing)

## Requirements

- [Node.js](https://nodejs.org/en/) version 12 or higher

## Getting Started

```bash
$ git clone https://github.com/ES-Community/node-secure.git
$ cd node-secure
$ npm ci
$ npm link
```

## Usage example

```bash
# Run analysis on the current working dir
$ nsecure cwd

# Run analysis for a given 'npm' package (must be in the registry).
$ nsecure from @sindresorhus/is
```

## Emojis for flags

| emoji | flag name | description |
| --- | --- | --- |
| 🌍 | hasIndirectDependencies | The package have indirect dependencies. |
| ⚠️ | hasSuspectImport | The package have suspect import. |
| ⛔️ | isDeprecated | The package has been tagged as deprecated |
| 📜 | hasLicense | The license is missing (or has not been detected) |
| 🔬 | hasMinifiedCode | The package has minified/uglified code |
| 💎 | hasCustomResolver | The package has at least one dependency that is not a npm package (like a git link or a local file link) |
| 💕 | hasManyPublishers | The package has more than one publishers |
| 👥 | hasChangedAuthor | The package "author" field has been updated at least one time |

> Note: **hasManyPublishers** and **hasChangedAuthor** are not flags linked to a given package version (but to the package itself).

## License
MIT

[travis-image]: https://img.shields.io/travis/com/ES-Community/node-secure/master.svg?style=flat-square
[travis-url]: https://travis-ci.com/ES-Community/node-secure
[codecov-image]: https://img.shields.io/codecov/c/github/ES-Community/node-secure.svg?style=flat-square
[codecov-url]: https://codecov.io/github/ES-Community/node-secure
