// The commits a teammate makes between the two sessions of some tasks of FL-082, in both
// configurations: a file renamed, or functions moved to another file, with every import updated.
// Each moves code the second session needs, so that a map made in the first session, or written
// in CLAUDE.md before it, names a place the code has left. A task not listed here has no
// teammate change.
import type { FunctionMove } from './move-functions.ts';

/** A file renamed with `git mv`; both paths are relative to the root of the tree. */
export type FileRename = { readonly from: string; readonly to: string };

export type TeammateChange = {
  /** The message of the teammate's commit. */
  readonly message: string;
  readonly renames: readonly FileRename[];
  readonly moves: readonly FunctionMove[];
};

/** The teammate's change of each task that has one, by task id. */
export const TEAMMATE_CHANGES: Readonly<Record<string, TeammateChange>> = {
  'late-fee-cap': {
    message: 'refactor(fees): name the late-fee module for what it charges',
    renames: [{ from: 'lib/fees/assess.js', to: 'lib/fees/overdue-charges.js' }],
    moves: [],
  },
  'branch-closures': {
    message: 'refactor(helpers): give the opening days of a branch a module of their own',
    renames: [],
    moves: [
      {
        names: ['isOpenOn', 'nextOpenDay'],
        from: 'lib/helpers/dates.js',
        to: 'lib/helpers/opening-days.js',
        preamble: "import { addDays, weekdayOf } from './dates.js';\n",
      },
    ],
  },
  'expired-hold-next-in-line': {
    message: 'refactor(holds): name the pickup module after the shelf it manages',
    renames: [{ from: 'lib/holds/pickup.js', to: 'lib/holds/pickup-shelf.js' }],
    moves: [],
  },
  'hold-queue-order': {
    message: 'refactor(holds): keep the blocking-hold lookup with the hold queue',
    renames: [],
    moves: [
      {
        names: ['findBlockingHold'],
        from: 'lib/circulation/checkout.js',
        to: 'lib/holds/queue.js',
        preamble: '',
      },
    ],
  },
  'selfcheck-card-numbers': {
    message: 'refactor(selfcheck): move the self-check protocol out of legacy',
    renames: [{ from: 'lib/legacy/sip2.js', to: 'lib/selfcheck/sip2.js' }],
    moves: [],
  },
};
