// The task set of FL-082: ten tasks on the fixture repository `fixture/`, a lending desk service
// of some forty small files, each task in two sessions. In the first, the person asks for a change
// that makes the agent find its way to one area of the code base; the runner then commits the
// work with `firstSessionCommit`. Between the sessions, five tasks get a teammate's commit
// (`teammate-changes.ts`) that renames a file or moves functions to another file, so that a map of
// the code made before it names a place the code has left. In the second session, started fresh,
// the person asks for another change in the same area. No prompt names a file or says where a
// function is: the agent has to find it, by exploring or from a map. Each task's check is
// `checks/<id>.test.mjs`, copied into the working tree only after the second session, so the agent
// never sees it; it imports the code from where it is after the teammate's change. `solutions/<id>/`
// holds the files of a right first session (`first/`) and a right second session (`second/`), used
// only by the tests that prove each check.
//
// The set is fixed before any run (functional requirement 4). A change after a run is added to
// CODEBASE_MAP_TASK_SET_CHANGES with its reason, and the report lists it.
import type { AgentTask, TaskSetChange } from '../agent-comparison/agent-tasks.ts';

const KEEP_TESTS = 'Keep the existing tests passing.';

/** The ten tasks, in the order the runner plays them. */
export const CODEBASE_MAP_TASKS: readonly AgentTask[] = [
  {
    id: 'late-fee-cap',
    knowledge: 'code location',
    firstSession:
      'The library board has stopped charging late fees to children. A member with a junior card must never be charged a late fee, whatever the item and however late it comes back.',
    firstSessionCommit: 'feat(fees): charge no late fee to junior members',
    secondSession: `A laptop that came back three months late was charged a late fee higher than the price of a new laptop. A late fee must never be more than the replacement cost of the item. ${KEEP_TESTS}`,
  },
  {
    id: 'renewal-waiting-hold',
    knowledge: 'code location',
    firstSession:
      'DVDs may now be renewed twice instead of once. Books and the other formats keep the renewal limits they have.',
    firstSessionCommit: 'feat(renewals): let a DVD be renewed twice',
    secondSession: `Members renew loans even when other members are queued for the item, so the people in the hold queue wait for months. A renewal must be refused, with the reason 'on-hold', when another member has a hold on the item that is waiting or ready for pickup. ${KEEP_TESTS}`,
  },
  {
    id: 'branch-closures',
    knowledge: 'code location',
    firstSession:
      'Our branches are closed on public holidays, which are listed with each branch, yet loans still fall due on those days and members find the doors locked. A loan must never fall due on a holiday of the branch its item belongs to.',
    firstSessionCommit: "fix(due-dates): never make a loan due on a branch's holiday",
    secondSession: `Branches sometimes close for several days in a row, for example for renovation. Such a closure is now listed with the branch, as closures: [{ from: '2027-02-01', to: '2027-02-14' }], both days included; a branch that has none has no closures field. Nothing that waits for the branch's next open day, such as a loan's due date or the last day to collect a hold, may fall within a closure. ${KEEP_TESTS}`,
  },
  {
    id: 'expired-hold-next-in-line',
    knowledge: 'code location',
    firstSession:
      'A ready hold should now wait on the pickup shelf for 10 days instead of 7 before it expires.',
    firstSessionCommit: 'feat(holds): keep a ready hold on the pickup shelf for 10 days',
    secondSession: `When a hold expires because nobody collected it, the item sits on the pickup shelf although other members are queued for it. When a hold expires, the next member waiting for the same item should get it: their hold becomes ready, from the day the expired hold was cleared. ${KEEP_TESTS}`,
  },
  {
    id: 'sms-notice-length',
    knowledge: 'code location',
    firstSession:
      "Overdue notices should tell the member how many days late the item is, for example 'It is 5 days late.'",
    firstSessionCommit: 'feat(notices): say how many days late an overdue item is',
    secondSession: `Our SMS provider rejects text messages longer than 160 characters, so members with a long title on hold never hear that it is ready. A notice sent by text message must be at most 160 characters: when its text is longer, keep its first 157 characters and add '...'. Notices sent by email stay as they are. ${KEEP_TESTS}`,
  },
  {
    id: 'hold-queue-order',
    knowledge: 'code location',
    firstSession:
      "Reference items, marked reference: true in the catalog, must stay in the library, but the desk can still check them out. Refuse such a checkout with the reason 'not-lendable'.",
    firstSessionCommit: 'fix(checkout): refuse to lend a reference item',
    secondSession: `When several members are queued for an item, the member at the front of the hold queue is told at the desk that the item is held for someone else. Only the member at the front of the queue may check the item out; the members queued behind them must not stop that checkout. ${KEEP_TESTS}`,
  },
  {
    id: 'selfcheck-card-numbers',
    knowledge: 'code location',
    firstSession:
      'The self-check machines print the due date on the receipt as they receive it, so members read 2026-12-17. Send it to them as 12/17/2026 instead, month, day and year.',
    firstSessionCommit: 'feat(selfcheck): send the due date as MM/DD/YYYY',
    secondSession: `The card scanners of the new self-check machines send the card number with spaces or dashes in it, such as 2123 4000 5678 90, and the machines then refuse every checkout as an unknown card. Accept a card number with spaces or dashes in it at the self-check machines. ${KEEP_TESTS}`,
  },
  {
    id: 'waived-fees',
    knowledge: 'code location',
    firstSession:
      'Staff members should have no limit on how many items they can have on loan. Adult and junior members keep their limits.',
    firstSessionCommit: 'feat(eligibility): lift the loan limit for staff',
    secondSession: `A member whose fees were waived at the desk is still refused at checkout for owing fees, and their account summary still shows the waived amount as owed. A waived fee is not owed. ${KEEP_TESTS}`,
  },
  {
    id: 'accent-search',
    knowledge: 'code location',
    firstSession:
      "Catalog search results are sorted by title, so 'The Hobbit' is listed under T. Sort them as librarians do, ignoring a leading 'The', 'A' or 'An'.",
    firstSessionCommit: 'feat(catalog): sort search results without a leading article',
    secondSession: `Searching the catalog for garcia marquez finds nothing, though we have his books, catalogued under García Márquez. Catalog search should ignore accents, in the query as well as in titles and authors. ${KEEP_TESTS}`,
  },
  {
    id: 'member-loans-route',
    knowledge: 'code location',
    firstSession:
      "The member summary of the API should also give the number of the member's loans that are overdue, as overdueCount.",
    firstSessionCommit: 'feat(api): count the overdue loans in the member summary',
    secondSession: `Add GET /members/:id/loans to the API. It answers with status 200 and { loans: [...] }, one entry { loanId, title, dueOn, overdue } for each loan the member has not returned, the earliest due first, where overdue is true when the due date is before today. When no member has that id, it answers with status 404 and the error code member-not-found, in the error format of the other routes. ${KEEP_TESTS}`,
  },
];

/** Changes to the task set since it was committed. None so far. */
export const CODEBASE_MAP_TASK_SET_CHANGES: readonly TaskSetChange[] = [];
