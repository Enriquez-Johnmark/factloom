# Issue tracker: roadmap documents

Work for this repo is tracked in Markdown under `docs/roadmap/`, not in GitHub Issues and not in `.scratch/`.

## Conventions

- `docs/roadmap/ROADMAP.md` is the index: every epic and work item with its status.
- One file per epic: `docs/roadmap/epics/EPIC-NN.md`. Each epic file contains the full specification of its work items.
- Epics are identified as `EPIC-01`, work items as `FL-001`. Identifiers are permanent and never reused.
- Status is one of `Pending`, `Completed`, `Blocked`, `Under Review`, recorded on the work item and mirrored in the index.
- Dependencies are a `Depends on:` line listing work-item identifiers.

## When a skill says "publish to the issue tracker"

Write the spec or ticket into the owning epic file as a work item, using the work-item structure already in that file, and add it to the index. Do not create GitHub issues, pull requests, labels, or branches.

## When a skill says "fetch the relevant ticket"

Search `docs/roadmap/epics/` for the `FL-NNN` identifier and read that section.

## Triage labels

The `triage` skill is not used in this repo. Where a skill says to apply `ready-for-agent`, set the status to `Pending`.

## Completing a work item

The order used for every work item so far. The evidence blocks of FL-008 to FL-068 are examples.

1. Read the work item in its epic file and the parts of `docs/architecture/` it cites. `INTERFACES.md` is the source of truth for signatures.
2. Write the code and its tests. Run `pnpm exec biome format --write .` and then `pnpm check`.
3. For each rule that matters, break the code once by hand, see a test fail, and restore it.
4. Commit the code in small commits and push. When the change touches native modules, child processes or the workflow, wait for the continuous integration run on Linux and macOS before recording evidence.
5. In the epic file: set the status in the table and in the work item, tick the acceptance criteria that are met, and add a "Recorded evidence" block. The block names the commits, says what differs from the work item as written, says what was not run, and quotes the `pnpm check` output.
6. Run the two scripts in [`scripts/roadmap/`](../../scripts/roadmap/README.md), then commit the epic file and `ROADMAP.md` as two commits and push.

A finding that changes a design document or closes an open question is written into that document in its own commit.
