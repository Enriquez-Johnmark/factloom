# @factloom/maintenance

Product 2, self-correcting and self-healing memory. It will hold the conflict judge, the follow-up that acts on feedback, and the scheduled jobs.

It imports `@factloom/core` only. It changes memory only through the fact operations in core: it builds no `ChangeSet`, calls no `MemoryStore.commit` and contains no SQL.

**Status:** the conflict judge, `judgeConflicts` (FL-041). Nothing calls it yet; FL-042 wires it into `remember`.

- Boundaries: [`docs/architecture/SYSTEM-BOUNDARIES.md`](../../docs/architecture/SYSTEM-BOUNDARIES.md)
- Work items: [`EPIC-08`](../../docs/roadmap/epics/EPIC-08.md) and [`EPIC-09`](../../docs/roadmap/epics/EPIC-09.md)
