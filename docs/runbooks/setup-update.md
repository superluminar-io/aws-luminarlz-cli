# Setup Update Runbook

This runbook explains why and how to use `setup update` safely in existing projects.

## Why use it

`setup update` helps you keep project scaffolding aligned with current blueprint defaults without blindly overwriting your local changes.

It is useful when:

- the CLI blueprint changed (new defaults, fixes, docs, stack wiring),
- your project was initialized earlier and drifted from current template files,
- you want controlled adoption of upstream blueprint improvements.
- you are testing local CLI blueprint/template changes in a real setup repository and need a safe way to apply them incrementally.

For the full local development workflow (`projen compile` + `file:` dependency install), see the [Local CLI Development Runbook](local-cli-development-with-real-setup.md).

## What it does

- creates missing blueprint files,
- shows diffs for existing files,
- applies only the changes you accept.

## When to use which mode

- interactive hunk mode (default): safest for regular updates.
  - in this mode, you can switch a single hunk to line mode when prompted.
  - prompt keys: `y` apply hunk, `n` skip hunk, `l` switch current hunk to line mode, `s` skip current file (jump to next file), `a` abort the entire update session.
- line mode (`--line-mode`): use when a hunk is large and you want finer control.
- dry-run (`--dry-run`): preview impact before changing files.
- non-interactive apply (`--yes`): use only in controlled automation or after prior dry-run.

## Recommended workflow

1. Start with a clean working tree:

```bash
git status
```

2. Preview changes first:

```bash
yarn run cli setup update --dry-run
```

3. Apply interactively:

```bash
yarn run cli setup update
```

4. If needed for detailed review:

```bash
yarn run cli setup update --line-mode
```

5. Validate project after changes:

```bash
yarn compile
yarn eslint
```

6. For config-related blueprint changes, run a real command path in your project repository, for example:

```bash
yarn run cli deploy
```

If your branch/version includes `doctor`, you can run it as an additional preflight check.

## Verification checklist

- no unexpected file overwrites,
- expected blueprint files created/updated,
- compile and lint pass,

## Common pitfalls

- Running with `--yes` without a prior dry-run can hide important diffs.
- Updating one repository does not update other project repositories automatically.
- If behavior depends on customizations stack resources, deploy the updated stack after accepting blueprint changes.
