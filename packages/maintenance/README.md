# @factloom/maintenance

Product 2, self-correcting and self-healing memory. It will hold the conflict judge, the follow-up that acts on feedback, and the scheduled jobs.

It imports `@factloom/core` only. It changes memory only through the fact operations in core: it builds no `ChangeSet`, calls no `MemoryStore.commit` and contains no SQL.

**Status:** scaffold only. The export in `src/index.ts` is a placeholder.

- Boundaries: [`docs/architecture/SYSTEM-BOUNDARIES.md`](../../docs/architecture/SYSTEM-BOUNDARIES.md)
- Work items: [`EPIC-08`](../../docs/roadmap/epics/EPIC-08.md) and [`EPIC-09`](../../docs/roadmap/epics/EPIC-09.md)
