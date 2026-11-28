# @kronomind/adapters

The domain adapters: one module per domain, each giving its entity types, predicates, extraction instructions and correction policy as data ([ADR 0026](../../docs/architecture/adr/0026-healthcare-proof-before-phase-4.md)). Only a domain adapter knows its domain; `core`, `graph-rag` and the storage adapters stay generic.

It imports `@kronomind/core` and `@kronomind/graph-rag`, whose use cases the import calls. Only `apps/mcp-server` imports it.

**Status:** the healthcare domain (FL-091) and the FHIR R4 import, `importFhirResources` (FL-092), for a proof on invented data only. Kronomind is not ready for patient data. The software development domain stays in `graph-rag`.

- Boundaries: [`docs/architecture/SYSTEM-BOUNDARIES.md`](../../docs/architecture/SYSTEM-BOUNDARIES.md)
- Work items: [`EPIC-13`](../../docs/roadmap/epics/EPIC-13.md)
