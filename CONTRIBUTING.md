# Contributing an app

Thank you for bringing an app to this catalog. This file explains how to submit one, which rules a pull request must pass and how the review works. The [README](README.md) explains how the catalog builds and publishes apps.

## Before you start

- Build the app with [`@pithyx/sdk`](https://www.npmjs.com/package/@pithyx/sdk) and develop it with `pithyx dev` from [`@pithyx/cli`](https://www.npmjs.com/package/@pithyx/cli). The template repositories `app-blank`, `app-showcase` and `app-chat` of the Pithyx project are good starting points.
- Try the package on a box as a sideload (Store, gear, Install from file). For a backend, `pithyx build` builds its images for your machine and `pithyx pack --images` puts them into the package.
- The app must be worth having for others, be your own work or one you may redistribute, and not use the name or brand of another company or product.

## Submitting

1. Fork this repository and create a branch.
2. Add exactly one folder `apps/<id>/`, named like the app's `id` in `pithyx.json`.
3. Add these files:
   - `pithyx.json`, with `license` (an SPDX expression) and `pithyx` (the range of Pithyx versions the app runs on, for example `>=0.1.0`); raise `dataVersion` whenever a release converts stored data so that the previous version cannot read it.
   - `icon.svg`, your own icon.
   - `maintainers.json`: `{ "maintainers": ["your-github-login"] }`. Everybody listed may open pull requests for later versions.
   - `LICENSE` (or `LICENSE.md`, `LICENSE.txt`).
   - The frontend: `package.json` and `package-lock.json` whose `npm run build` writes `dist/`, or a folder `frontend/` that needs no build.
   - For a backend: `backend/compose.dev.yaml` with `build:` for the services the catalog builds, and their Dockerfiles. `backend.compose` in the manifest names `backend/compose.yaml`; CI writes that file, so leave it out.
   - Optional: `README.md` and up to 8 screenshots in `screenshots/`.
4. Open a pull request against `master` and fill in the template.

A later version changes the same folder and raises `version`. Only a maintainer listed in the folder's `maintainers.json` before the pull request may open it.

## The rules

`pithyx catalog check` runs these rules on every pull request; they are the data in `catalog.v1.rules.json` of `@pithyx/sdk`, and a box applies the same rules to custom catalogs.

| Rule                  | What it means                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| One app               | A pull request changes files in one folder `apps/<id>/` and nothing else.                             |
| Folder and id         | The folder is named like the app's id. Only the official catalog may use `org.pithyx.*`.            |
| Required files        | `pithyx.json`, `icon.svg`, `maintainers.json`, a license file, and `backend/compose.dev.yaml` for a backend. |
| Manifest              | Valid for the manifest schema, with `license` and `pithyx`; the icon and the Compose file pass the box's checks. |
| Higher version        | The version is above every version the catalog published.                                            |
| License               | An expression of OSI approved licenses (and listed exceptions), no `LicenseRef-`.                    |
| Text files            | Source and configuration as UTF-8 text without lines over 1000 characters (SVG excepted).            |
| No binaries           | No compiled code, archives or other binaries; images and fonts only as PNG, JPEG, GIF, WebP and WOFF2 with matching content. |
| Not minified          | No `.min.js` or `.min.css` files and no generated bundles; the catalog builds them.                  |
| Hidden files          | Only `.gitignore`, `.dockerignore`, `.editorconfig`, `.npmrc`, `.nvmrc`, `.prettierrc` and `.prettierignore`. |
| Pinned images         | Every `FROM`, and every `COPY --from` that is not a stage, names an image with `@sha256:` (or `scratch`). |
| Screenshots           | At most 8, directly in `screenshots/`, PNG, JPEG or WebP, lower case names, at most 1 MB each.       |
| Size                  | The app folder holds at most 5 MB.                                                                    |
| Maintainers           | The author of the pull request is listed in `maintainers.json`; a new app's file names its author.   |

## The review

The catalog's owner reviews every pull request by hand. The rules only catch what a machine can; the review reads the code and looks at:

- what the app does, and whether its permissions and folders match that;
- the backend: images, mounts, elevated rights, network use and root in a container;
- dependencies and build steps, and anything that downloads code at run time;
- the id (your own domain), the name and the icon (no foreign brands);
- that the app is maintained and worth offering to everybody who uses this catalog.

After the merge, CI publishes the version to `catalog-next` (the beta channel). It reaches the stable channel when the owner promotes `catalog-next`.

## Maintainers

`maintainers.json` names who may change an app. Add co-maintainers in a pull request of your own; the owner may change the file, for example when an app is taken over. An app whose maintainers do not answer may be removed from future releases; published versions stay installable.
