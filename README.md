# Pithyx official apps

This repository is the **official app catalog of [Pithyx](https://github.com/pithyx)**: the apps the Pithyx project offers in the Store's tab "Official" with the badge "Pithyx". It is the only catalog that may publish apps with ids under `org.pithyx.*`. A Pithyx box has it enabled by default, verifies every index against the project's keys built into Pithyx, and installs only what the project reviewed, built and signed. The system apps (Files, Settings, Store and the rest) are not here: they ship with Pithyx itself.

## Structure

- `master`: the source of every app in `apps/<id>/` (it starts empty), changed only by reviewed pull requests, and `catalog.json`.
- `catalog-next`: written by CI after each merge, signed with the `next` key; boxes on the beta channel read it.
- `catalog`: written by the `promote` workflow after the owner's approval, signed with the `catalog` key; boxes on the stable channel read it.
- Images: `ghcr.io/pithyx/apps/<id>/<service>:<version>`, linked only by digest.

How a catalog works, what CI does, the rules for a pull request and how to report a problem: see the [catalog template](https://github.com/pithyx/catalog-template), [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
