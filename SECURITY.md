# Security

## How a box trusts this catalog

- Every version in `index.json` names the SHA-256 and size of its package, manifest, icon and screenshots, and its images by digest per architecture. A box refuses any file that differs and pulls images only by digest.
- `index.json.sig` holds Ed25519 signatures over the exact bytes of `index.json`. A box checks it before it reads the index, against public keys built into Pithyx for the project's catalogs: the `catalog` key for the stable and the beta channel, the `next` key for the beta channel only. Signatures by keys a box does not know are ignored.
- The index names its catalog, its channel and a `sequence` that grows with every publish. A box refuses an index of another catalog or channel and one older than the last it verified, so an old or foreign index cannot be replayed.
- Custom catalogs are not signed and are shown as unverified; the hashes and the sequence still apply.

## Keys

- The private keys live only in the GitHub environments `catalog-next` and `catalog-release` as the secret `SIGNING_KEY`, with the key's id in the variable `SIGNING_KEY_ID`. They are never committed, logged or kept elsewhere.
- `catalog-release` requires the owner's approval before a job can use its key, so a compromised action or pull request cannot sign the stable channel.
- The jobs that run an app's code never see a key or a write token (see "What CI does" in the README).
- Rotation: create a new key, release Pithyx with its public key next to the old one, sign with both for a while (`pithyx catalog sign --append`), then drop the old key.

## Reporting a problem

Report a security problem of this catalog or of an app in it privately: use **Security, Report a vulnerability** of this repository on GitHub. Please do not open a public issue for it. Problems of Pithyx itself go to the Pithyx project's own security policy.
