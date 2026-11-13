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
