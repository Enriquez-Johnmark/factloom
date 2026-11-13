# Built from scratch, not on an existing memory project

Status: accepted

Factloom does not fork, wrap or build on an existing memory system. Existing systems were studied instead ([competitive analysis](../../research/evaluations/competitive-analysis.md)), and their strengths became requirements.

The reason is the data model. The rules Factloom is built around, facts that change only by invalidation, a link from each superseded fact to its replacement, an audit entry for every change, are properties of the storage layer. Of the systems studied, the one with bi-temporal facts edits them in place and keeps no such link, and the others have no valid time. Adding these rules on top of a system that does not have them would mean replacing its storage.

## Consequences

Everything those projects already have must be built: extraction, entity resolution, retrieval. The competitive analysis records where they are ahead today.
