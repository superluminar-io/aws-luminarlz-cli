# Blueprint Update Runbook

This runbook explains why and how to use `blueprint update` safely in existing projects.

## Why use it

`blueprint update` helps you keep project scaffolding aligned with current blueprint defaults without blindly overwriting your local changes.

It is useful when:

- the CLI blueprint changed (new defaults, fixes, docs, stack wiring),
- your project was initialized earlier and drifted from current template files,
- you want controlled adoption of upstream blueprint improvements.

## What it does

- creates missing blueprint files,
- shows diffs for existing files,
- applies only the changes you accept.

## When to use which mode

- interactive hunk mode (default): safest for regular updates.
  - in this mode, you can switch a single hunk to line mode when prompted.
  - prompt keys: `y` apply hunk, `n` skip hunk, `l` switch current hunk to line mode, `a` abort the entire update session.
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
npm run cli -- blueprint update --dry-run
```

3. Apply interactively:

```bash
npm run cli -- blueprint update
```

4. If needed for detailed review:

```bash
npm run cli -- blueprint update --line-mode
```

5. Validate project after changes:

```bash
yarn compile
yarn eslint
```

6. For config-related blueprint changes, also run:

```bash
npm run cli -- doctor
```

## Verification checklist

- no unexpected file overwrites,
- expected blueprint files created/updated,
- compile and lint pass,

## Common pitfalls

- Running with `--yes` without a prior dry-run can hide important diffs.
- Updating one repository does not update other project repositories automatically.
- If behavior depends on customizations stack resources, deploy the updated stack after accepting blueprint changes.
