// The task sets the agent comparison can play: the memory tasks of FL-074, the default, the
// change-history tasks of FL-081 and the code base map tasks of FL-082. A run log names its set, so that the report is built from the
// tasks that were played.
import {
  CHANGE_HISTORY_TASK_SET_CHANGES,
  CHANGE_HISTORY_TASKS,
} from '../change-history/change-history-tasks.ts';
import {
  CHANGE_HISTORY_CHECKS_DIRECTORY,
  commitFirstSession,
  prepareChangeHistoryCopy,
} from '../change-history/prepare-change-history-copy.ts';
import { CODEBASE_MAP_TASK_SET_CHANGES, CODEBASE_MAP_TASKS } from '../codebase-map/codebase-map-tasks.ts';
import {
  applyBetweenSessions,
  CODEBASE_MAP_CHECKS_DIRECTORY,
  commitFirstSession as commitCodebaseMapFirstSession,
  prepareCodebaseMapCopy,
  writeClaudeMdBaseline,
} from '../codebase-map/prepare-codebase-map-copy.ts';
import { AGENT_TASKS, type AgentTask, TASK_SET_CHANGES, type TaskSetChange } from './agent-tasks.ts';
import { prepareFixtureCopy } from './prepare-fixture-copy.ts';
import { CHECKS_DIRECTORY } from './run-task-check.ts';

/** The names a run log and the runner's `--task-set` option take. */
export const TASK_SET_NAMES = ['memory', 'change-history', 'codebase-map'] as const;
export type TaskSetName = (typeof TASK_SET_NAMES)[number];

/** The set a run plays when none is named, and that a run log without a name was played with. */
export const DEFAULT_TASK_SET_NAME: TaskSetName = 'memory';

export type TaskSet = {
  readonly name: TaskSetName;
  /** What the set is, in a few words, for the report. */
  readonly description: string;
  readonly tasks: readonly AgentTask[];
  readonly changes: readonly TaskSetChange[];
  /** Builds a clean copy of the set's fixture repository and returns its directory. */
  readonly prepareCopy: () => string;
  readonly checksDirectory: string;
  /**
   * Commits the first session's work with the task's message, for a set whose tasks carry one;
   * null for a set whose tasks commit nothing.
   */
  readonly commitFirstSession: ((directory: string, message: string) => void) | null;
  /** Whether the run with Factloom runs maintenance before each session, as the guide's hook does (FL-082). */
  readonly runsMaintenance: boolean;
  /**
   * Writes and commits the set's hand-written `CLAUDE.md` map in a copy, for a run without
   * Factloom with `--baseline claude-md`; null for a set that has none (FL-082).
   */
  readonly claudeMdBaseline: ((directory: string) => void) | null;
  /**
   * Makes and commits a task's change between its two sessions, as a teammate's commit would,
   * in both configurations; null for a set whose tasks have none (FL-082).
   */
  readonly betweenSessions: ((directory: string, taskId: string) => void) | null;
};

const TASK_SETS: Readonly<Record<TaskSetName, TaskSet>> = {
  memory: {
    name: 'memory',
    description: 'memory tasks of FL-074',
    tasks: AGENT_TASKS,
    changes: TASK_SET_CHANGES,
    prepareCopy: prepareFixtureCopy,
    checksDirectory: CHECKS_DIRECTORY,
    commitFirstSession: null,
    runsMaintenance: false,
    claudeMdBaseline: null,
    betweenSessions: null,
  },
  'change-history': {
    name: 'change-history',
    description: 'change-history tasks of FL-081',
    tasks: CHANGE_HISTORY_TASKS,
    changes: CHANGE_HISTORY_TASK_SET_CHANGES,
    prepareCopy: prepareChangeHistoryCopy,
    checksDirectory: CHANGE_HISTORY_CHECKS_DIRECTORY,
    commitFirstSession,
    runsMaintenance: false,
    claudeMdBaseline: null,
    betweenSessions: null,
  },
  'codebase-map': {
    name: 'codebase-map',
    description: 'code base map tasks of FL-082',
    tasks: CODEBASE_MAP_TASKS,
    changes: CODEBASE_MAP_TASK_SET_CHANGES,
    prepareCopy: prepareCodebaseMapCopy,
    checksDirectory: CODEBASE_MAP_CHECKS_DIRECTORY,
    commitFirstSession: commitCodebaseMapFirstSession,
    runsMaintenance: true,
    claudeMdBaseline: writeClaudeMdBaseline,
    betweenSessions: applyBetweenSessions,
  },
};

/** Finds a task set by name, or returns null for a name that is not one. */
export function findTaskSet(name: string): TaskSet | null {
  const known = TASK_SET_NAMES.find((candidate) => candidate === name);
  return known === undefined ? null : TASK_SETS[known];
}
