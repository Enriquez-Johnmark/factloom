# Vector search runs on an ordinary table

Status: accepted

Embeddings are stored in an ordinary table, `fact_embedding`, and the vector lane orders rows by `vec_distance_cosine()` from `sqlite-vec`. It does not use the extension's `vec0` virtual table.

The time filter is the reason. A `vec0` table rejects missing values and filters only on integer columns, so using it would mean keeping integer copies of the four time columns with sentinel values for "unknown", in step with the fact table. On an ordinary table the vector lane uses exactly the same `WHERE` clause as every other read.

Measured on Linux with random vectors ([spike](../../../spikes/sqlite-vec-fts5/README.md)): the two methods returned the same ten nearest rows, and the ordinary table took about 10 ms for 10,000 vectors of 768 dimensions and about 120 ms for 100,000. Both are exact scans; `vec0` in the released version has no approximate index either.

## Considered options

- **`vec0` with time columns copied as integers.** Rejected for the bookkeeping described above.
- **`vec0` without a time filter, filtering afterwards.** Rejected: revisions copy vectors, so the nearest rows to a question can all be superseded copies, and the lane would return fewer facts than asked for.

## Consequences

Search time grows in a straight line with the number of facts in a namespace. That is acceptable for one repository's memory and should be measured again before a namespace approaches a few hundred thousand facts. Because the embeddings are ordinary rows, adding an approximate index later is an addition, not a migration.
