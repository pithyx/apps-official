# Pithyx catalog template

This repository is the template for **app catalogs of [Pithyx](https://github.com/pithyx)**, the self-hosted NAS and server OS with a web desktop. A catalog is a Git repository that holds the source of apps and publishes them, built and signed, so that a Pithyx box can list, install and update them in its Store. The project's own catalogs, `pithyx/apps-official` and `pithyx/apps-community`, are made from this template, and anyone can use it to run a catalog of their own.

Use it with **Use this template** on GitHub. Nothing in it needs a server: GitHub Actions builds the apps, the GitHub container registry holds their images, and the box reads the catalog straight from Git.

## Contents

- [How a catalog works](#how-a-catalog-works)
- [Layout and branches](#layout-and-branches)
- [Submitting an app](#submitting-an-app)
- [What CI does](#what-ci-does)
- [Promoting and signing](#promoting-and-signing)
- [Channels](#channels)
- [Making your own catalog](#making-your-own-catalog)
- [Adding a catalog to a box](#adding-a-catalog-to-a-box)
- [Private catalogs](#private-catalogs)
- [Files of this repository](#files-of-this-repository)

## How a catalog works

A Pithyx app is a static frontend plus an optional backend of containers, shipped as a package `<id>-<version>.pithyxapp` (a deterministic tar.gz with `pithyx.json`, `icon.svg`, the built frontend and, for a backend, `backend/compose.yaml` with its images pinned by digest and `backend/images.lock.json`). A box never builds anything: it installs packages and pulls images by digest.

A catalog turns reviewed source into such packages:

1. A developer opens a pull request that adds or changes one app folder `apps/<id>/` on `master`.
2. The `check` workflow applies the catalog rules and builds the app, without any secret.
3. The catalog's owner reviews the code and merges.
4. The `publish` workflow builds the merged commit, pushes the backend images to the container registry, packs the app and adds it to the branch `catalog-next` with an updated `index.json`.
5. When the owner runs the `promote` workflow and approves it, the versions of `catalog-next` move to the branch `catalog`, and `index.json` is signed with the catalog's key.
6. Boxes fetch `catalog` (or `catalog-next` on the beta channel) at their daily check time, verify it and offer the new versions.

The developer never publishes anything themselves: the catalog builds what was reviewed, from the commit that was merged, so a later change of the developer's own repository or registry cannot change what a box installs.

## Layout and branches

The branch **`master`** holds the source, written by pull requests:

```
catalog.json                      the catalog's id, name and image registry
apps/<id>/                        one folder per app, named like its id
  pithyx.json                     the manifest (needs "license" and "pithyx")
  icon.svg                        the icon
  maintainers.json                the GitHub accounts that may change the app
  LICENSE                         an OSI license (also LICENSE.md or LICENSE.txt)
  README.md                       optional
  screenshots/*.png|jpg|webp      optional, at most 8 of 1 MB each
  package.json, package-lock.json the frontend's build (npm ci, npm run build into dist/)
  frontend/                       or a frontend without a build step
  backend/compose.dev.yaml        the backend's source form, with build: per service
  backend/<service>/Dockerfile    every FROM pinned by @sha256
.github/                          the workflows and the pull request template
vendor/                           temporary, see "What CI does"
```

The branches **`catalog-next`** and **`catalog`** are written only by CI. Each holds `catalog.json` (copied from `master`), `index.json`, `index.json.sig` when the catalog signs, and per app and version a folder that never changes once published:

```
apps/<id>/<version>/
  <id>-<version>.pithyxapp        the package, without image files
  pithyx.json                     the same bytes as in the package
  icon.svg                        the same bytes as in the package
  screenshots/<name>
```

`index.json` lists every version with the SHA-256 and size of each of these files, the images by digest per architecture, the range of Pithyx versions it runs on (`pithyx`), its `dataVersion`, license and source (repository, commit and folder). Its `sequence` grows by one with every publish, and a box refuses an index older than the one it has.

## Submitting an app

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. In short:

1. Develop and test the app with `pithyx dev` from [`@pithyx/cli`](https://www.npmjs.com/package/@pithyx/cli), and try its package on a box as a sideload.
2. Fork this repository and add your app as `apps/<id>/` (the id is your domain reversed plus the app name, for example `com.mueller.chat`). Put your GitHub login into `maintainers.json`.
3. For a backend, write `backend/compose.dev.yaml` with `build:` and pin every `FROM` by digest. The catalog builds the images; you never publish an image yourself.
4. Run `pithyx validate` on a local build, then open one pull request per app. The pull request template lists what the review looks at.

A later version is a pull request that raises `version` in `pithyx.json`, opened by one of the app's maintainers.

## What CI does

| Workflow      | When                             | Rights                                       | Runs the app's code |
| ------------- | -------------------------------- | -------------------------------------------- | ------------------- |
| `check.yml`   | a pull request that changes `apps/` | read the repository                       | yes, to build it    |
| `publish.yml` | a push to `master`, or by hand   | build: read only; publish: write the branch `catalog-next` and the images, the `next` key | build: yes; publish: no |
| `promote.yml` | by hand, after the owner's approval | write the branch `catalog`, the `catalog` key | no               |

**Build and publish are separate jobs.** Building an app runs its code: `npm ci`, `npm run build` and the `RUN` steps of its Dockerfiles. That job gets no write rights and no secrets, so a malicious build step can neither push anything nor read a key. It hands the built frontend and the images as OCI archives to the publish job, which runs only the `pithyx` command: it pushes the images as `<images>/<id>/<service>:<version>`, pins `compose.yaml` and the images lock to the pushed digests, packs the app, adds it to `catalog-next`, signs the index with the `next` key and pushes the branch. A published version is never overwritten: the tag must not exist yet (or point to the same digest), and the version folder must be new.

Images are built reproducibly where the Dockerfile allows it: for `linux/amd64` and `linux/arm64`, with the commit's time as `SOURCE_DATE_EPOCH`, rewritten timestamps and no attestations, from base images pinned by digest.

Pull requests from forks run only after a maintainer of this repository approves the run (Settings, Actions, "Require approval for all external contributors").

`pithyx` comes from `@pithyx/cli`. **Temporary:** until `@pithyx/cli` 1.0.0-rc.5 is on npm, the workflows install it from the packages in `vendor/` (built with `npm pack` from the Pithyx repository); see `.github/actions/setup-pithyx/action.yml`. Afterwards they install the pinned version from npm and `vendor/` goes.

## Promoting and signing

`catalog-next` is the beta channel: every merge lands there within minutes. The stable channel `catalog` moves only when the catalog's owner runs **Actions, promote, Run workflow** and approves the job in the environment `catalog-release`. The job copies every version of `catalog-next` that `catalog` does not have, checks each file against its index entry, writes the stable `index.json` with the next sequence and signs it.

Signing uses Ed25519 over the exact bytes of `index.json`; the result is `index.json.sig` with the key's id. Two keys sign, each in its own GitHub environment:

| Environment       | Secret        | Variable         | Signs           | Protection                       |
| ----------------- | ------------- | ---------------- | --------------- | -------------------------------- |
| `catalog-release` | `SIGNING_KEY` | `SIGNING_KEY_ID` | `catalog`       | the owner as required reviewer   |
| `catalog-next`    | `SIGNING_KEY` | `SIGNING_KEY_ID` | `catalog-next`  | none, publish runs on every merge |

A key is a PEM file from `openssl genpkey -algorithm ed25519`; only the secret holds it. The project's boxes have the public keys of `pithyx/apps-official` and `pithyx/apps-community` built in, the `catalog` key for both channels and the `next` key for the beta channel only. Without a `SIGNING_KEY` the workflows publish an unsigned index, which is what every custom catalog does: a box shows custom catalogs as unverified and does not check their signature. See [SECURITY.md](SECURITY.md) for keys and rotation.

## Channels

A box follows one channel for all its catalogs, set in the Store's settings:

- **stable** reads the branch `catalog`: versions the owner promoted.
- **beta** reads the branch `catalog-next`: every merged version, signed by the `next` key.

## Making your own catalog

1. **Use this template** to create a repository (public, or private, see below).
2. Edit `catalog.json`: an `id` from your own domain reversed plus a name (for example `com.mueller.apps`; `org.pithyx.*` is reserved), the `name` and `description` shown in the Store, the `homepage`, and `images`, the registry path CI pushes to, usually `ghcr.io/<owner>/apps`. The publish workflow refuses to run while the id is still `com.example.catalog`.
3. Delete `apps/com.example.hello` or replace it with your apps.
4. Optional: create the environments `catalog-next` and `catalog-release` (Settings, Environments), add yourself as a required reviewer of `catalog-release`, and set their secrets if you want to sign. A box ignores the signature of a custom catalog, so signing only matters for catalogs the project builds into boxes.
5. Merge an app: `publish` creates `catalog-next`. Run `promote` for `catalog`.
6. The GitHub container registry creates each image package as **private**, even in a public repository. Boxes pull without credentials, so make every new package public once, after its first publish (the package's settings, "Change visibility"), or give the boxes a read token (see below).

## Adding a catalog to a box

In the Store, open the gear, then **Catalogs, Add catalog**, and enter the repository's URL:

- `https://github.com/<owner>/<repository>.git` for a public catalog,
- `git@github.com:<owner>/<repository>.git` for a private one (next section).

The box fetches the branch of its channel at once and then at its check time every day. It keeps a shallow copy in `/var/lib/pithyx/catalogs/<id>/` and checks `index.json` and every file it uses against their hashes; when a fetch fails it keeps the last good copy and shows the catalog's status in the Store's settings. Custom catalogs and their apps are for administrators and marked unverified.

## Private catalogs

A private repository works over SSH with a deploy key:

1. Add the catalog with its SSH URL. The box makes a key pair for this catalog and shows the public key.
2. In the repository, open Settings, Deploy keys, Add deploy key, paste it and leave "Allow write access" off.
3. In the Store, fetch the catalog again. The box pins the host key of the server on the first connection (GitHub's keys are built in).

When the images of a private catalog are private as well, give the box a read token for the registry in the catalog's settings; it is used only to pull that catalog's images. Note that private repositories on GitHub's free plan have no environments, so a private catalog publishes unsigned, which a box accepts for a custom catalog.

## Files of this repository

| Path                                  | Purpose                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| `catalog.json`                        | The catalog's id, name, description, homepage and image registry |
| `apps/com.example.hello/`             | An example app without a build step; replace it                  |
| `CONTRIBUTING.md`                     | How to submit an app and the rules a pull request must pass      |
| `SECURITY.md`                         | Signatures, keys and how to report a problem                     |
| `.github/pull_request_template.md`    | What a submission states and what the review checks              |
| `.github/workflows/check.yml`         | Rules and a test build for pull requests                         |
| `.github/workflows/build.yml`         | The build job both check and publish use, without secrets        |
| `.github/workflows/publish.yml`       | Push images, pack and add to `catalog-next` after a merge        |
| `.github/workflows/promote.yml`       | Move `catalog-next` to `catalog` and sign, after approval        |
| `.github/actions/setup-pithyx/`       | Installs Node.js and the `pithyx` command                        |
| `vendor/`                             | Temporary copy of `@pithyx/cli` until it is on npm               |

The files of this repository are under the MIT license (`LICENSE`); each app keeps its own license in its folder.
