# Local CLI Development Against a Real Setup

This runbook describes a practical workflow to test local `aws-luminarlz-cli` changes in a real landing-zone project repository.

## Goal

Use local CLI code from the CLI repository inside an already initialized landing-zone project repository, without publishing a package version.

## Repositories

- CLI repo: `aws-luminarlz-cli` (where code changes are developed)
- Landing-zone project repository: repository created from the foundational blueprint (where real deploys happen)

## Why `npx projen compile` is required

The landing-zone project repository does not execute TypeScript files from `src/`.
It executes the installed package output (`bin/aws-luminarlz-cli` -> `lib/*.js`).

That means:

- editing `src/**/*.ts` in the CLI repo changes source only,
- the landing-zone project repository still runs the previous compiled JavaScript until `lib/` is rebuilt.

CLI repo (`aws-luminarlz-cli`): run this after code changes and before reinstalling with `file:` in the landing-zone project repository:

```bash
npx projen compile
```

## Workflow

1. In the CLI repo, implement changes.
2. Run in the CLI repo (`aws-luminarlz-cli`):

```bash
npx projen compile
```

3. Run in the landing-zone project repository:

```bash
yarn add @superluminar-io/aws-luminarlz-cli@file:../aws-luminarlz-cli --force
```

Landing-zone project repository: adjust the relative path so it points to your local CLI repository.

4. Run in the landing-zone project repository when blueprint/template changes are part of the local CLI change:

```bash
npm run cli -- blueprint update --dry-run
npm run cli -- blueprint update
```

Landing-zone project repository: this is especially useful when your CLI changes include blueprint/template updates.

5. Run in the landing-zone project repository (typical sequence):

```bash
npm run cli -- deploy
```

## Recommended checks

- Confirm the landing-zone project repository now resolves the local dependency:

```bash
yarn why @superluminar-io/aws-luminarlz-cli
```

- If output still looks old:
  - CLI repo (`aws-luminarlz-cli`): run `npx projen compile` again.
  - Landing-zone project repository: rerun `yarn add @superluminar-io/aws-luminarlz-cli@file:../aws-luminarlz-cli --force`.

## Command location summary

- Run in CLI repo (`aws-luminarlz-cli`):
  - `npx projen compile`
- Run in landing-zone project repository:
  - `yarn add @superluminar-io/aws-luminarlz-cli@file:../aws-luminarlz-cli --force`
  - `npm run cli -- blueprint update ...`
  - `npm run cli -- deploy`

## Common pitfalls

- Forgetting `npx projen compile`: landing-zone project repository still executes stale `lib/` output.
- Wrong `file:` path in `yarn add`: landing-zone project repository uses another package source than expected.
- Updating CLI logic only: no need for `blueprint update` unless blueprint/template files changed.
