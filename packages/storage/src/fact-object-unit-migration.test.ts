// Tests of the twelfth migration, which adds a unit beside a fact's value (FL-099, ADR 0028):
// its check, and the trigger that keeps fact rows unchanged, now naming the unit.
import { afterEach, describe, expect, it } from 'vitest';
import { writeTimeline } from './memory-store-contract.ts';
import { openConnection } from './open-connection.ts';
import { closeLater, closeTestStores, openOnFile } from './sqlite-test-store.ts';

afterEach(closeTestStores);

describe('the fact object unit migration', () => {
  it('refuses any update of a unit, and a unit on a fact whose object is an entity', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);
    const db = openConnection(path);
    closeLater(() => db.close());

    expect(() => db.exec("UPDATE fact SET object_unit = '%' WHERE id = 'pg14-ended'")).toThrow(
      'a fact changes only by being invalidated once, or purged once',
    );
    expect(() =>
      db.exec(
        `INSERT INTO fact (id, namespace, subject_entity_id, predicate, object_entity_id, object_unit, statement,
                           confidence, created_at)
         VALUES ('f-unit', 'repo:example', 'e-repo', 'depends_on', 'e-repo', '%', 'A unit on an entity',
                 1, '2026-06-01T00:00:00.000Z')`,
      ),
    ).toThrow('CHECK constraint failed');
  });

  it('refuses an invalidation that changes a unit, and a purge that keeps one', async () => {
    const { store, path } = openOnFile();
    await writeTimeline(store);
    const db = openConnection(path);
    closeLater(() => db.close());
    db.exec(
      `INSERT INTO fact (id, namespace, subject_entity_id, predicate, object_value, object_unit, statement,
                         confidence, created_at)
       VALUES ('f-unit', 'repo:example', 'e-repo', 'measured_as', '6.8', '%', 'A result of 6.8 %',
               1, '2026-06-01T00:00:00.000Z')`,
    );

    expect(() =>
      db.exec(
        "UPDATE fact SET invalidated_at = '2026-06-02T00:00:00.000Z', object_unit = 'mmol/mol' WHERE id = 'f-unit'",
      ),
    ).toThrow('a fact changes only by being invalidated once, or purged once');
    expect(() =>
      db.exec(
        "UPDATE fact SET statement = '[purged]', object_value = '[purged]', purged_at = '2026-06-02T00:00:00.000Z' WHERE id = 'f-unit'",
      ),
    ).toThrow('a fact changes only by being invalidated once, or purged once');
    db.exec(
      "UPDATE fact SET statement = '[purged]', object_value = '[purged]', object_unit = NULL, purged_at = '2026-06-02T00:00:00.000Z' WHERE id = 'f-unit'",
    );
  });
});
