<!-- One app per pull request. See CONTRIBUTING.md for the rules and the review. -->

## App

- Id and version:
- What it does, in one or two sentences:
- Source of the code (if it is not only in this pull request):

## Checklist

- [ ] One folder `apps/<id>/`, named like the app's id, and nothing outside it.
- [ ] `pithyx.json` has `license` and `pithyx`; the version is higher than every published one.
- [ ] My GitHub login is in `maintainers.json`.
- [ ] The license allows the catalog to build and redistribute the app and its images.
- [ ] Every `FROM` is pinned with `@sha256:`; no binaries, minified files or generated bundles.
- [ ] I tried the package on a box as a sideload (`pithyx build`, `pithyx pack --images`).
- [ ] The permissions, folders and elevated rights are the ones the app needs, and the description below says why.

## Permissions and backend

<!-- Which permissions, storage requests, network access, root or elevated rights the app asks for, and why. -->
