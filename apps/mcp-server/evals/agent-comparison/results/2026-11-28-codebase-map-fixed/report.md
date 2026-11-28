# Token and tool-call comparison with and without Kronomind

| | |
|---|---|
| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |
| Model | claude-sonnet-5-5 (without); claude-sonnet-5-5 (with) |
| Date | 2026-11-27 (without); 2026-11-28 (with) |
| Tasks | 10 in the set of code base map tasks of FL-082, 10 compared; each in two sessions per configuration |

## Result

No clear difference. With Kronomind, the median task's tokens, input and output together, changed by -5.0%, which is inside the 10% either way that this report counts as no clear difference; it made 1 more tool call, and 10 of 10 checks passed with Kronomind and 10 of 10 without it.

10 tasks show a direction, not a law: this is not a claim of statistical significance.

Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.

## Totals

| Figure | Without Kronomind | With Kronomind | Difference |
|---|---|---|---|
| Input tokens | 4,182,772 | 4,102,085 | -80,687 |
| of which read from the cache | 3,806,932 | 3,744,915 | -62,017 |
| Output tokens | 71,567 | 63,924 | -7,643 |
| Tool calls | 215 | 224 | +9 |
| Checks passed | 10 of 10 | 10 of 10 | 0 |

## Medians

| Figure | Median of the per-task differences, with minus without |
|---|---|
| Input tokens | -20,296 |
| Output tokens | -890 |
| Tool calls | +1 |
| Input and output tokens, as a share of the figure without | -5.0% |

## Per task

| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |
|---|---|---|---|---|---|---|---|---|---|
| late-fee-cap | 470,832 | 494,887 | 6,446 | 7,313 | 22 | 25 | pass | pass | +5.2% |
| renewal-waiting-hold | 340,077 | 335,760 | 6,423 | 5,646 | 18 | 18 | pass | pass | -1.5% |
| branch-closures | 575,395 | 528,486 | 11,602 | 8,091 | 29 | 29 | pass | pass | -8.6% |
| expired-hold-next-in-line | 491,135 | 429,031 | 8,599 | 7,449 | 26 | 19 | pass | pass | -12.7% |
| sms-notice-length | 474,709 | 429,156 | 7,441 | 7,905 | 23 | 27 | pass | pass | -9.4% |
| hold-queue-order | 393,665 | 401,250 | 6,447 | 5,269 | 19 | 19 | pass | pass | +1.6% |
| selfcheck-card-numbers | 272,240 | 366,849 | 4,541 | 5,645 | 16 | 20 | pass | pass | +34.6% |
| waived-fees | 410,949 | 374,674 | 5,184 | 4,960 | 19 | 21 | pass | pass | -8.8% |
| accent-search | 351,640 | 309,213 | 6,149 | 5,146 | 21 | 19 | pass | pass | -12.1% |
| member-loans-route | 402,130 | 432,779 | 8,735 | 6,500 | 22 | 27 | pass | pass | +6.9% |

## Tool calls by tool

| Tool | Without Kronomind | With Kronomind |
|---|---|---|
| `Bash` | 102 | 87 |
| `Edit` | 67 | 65 |
| `Read` | 44 | 60 |
| `ToolSearch` | 0 | 6 |
| `Write` | 1 | 0 |
| `bash` | 1 | 1 |
| `mcp__kronomind__invalidate_fact` | 0 | 2 |
| `mcp__kronomind__record_fact` | 0 | 3 |

## Sessions

| Task | Configuration | Session | Input tokens | Output tokens | Tool calls | Turns | Result | Check |
|---|---|---|---|---|---|---|---|---|
| late-fee-cap | without | 1 | 292,922 | 3,456 | 12 | 13 | success |  |
| late-fee-cap | without | 2 | 177,910 | 2,990 | 10 | 11 | success | pass |
| renewal-waiting-hold | without | 1 | 179,891 | 2,375 | 9 | 10 | success |  |
| renewal-waiting-hold | without | 2 | 160,186 | 4,048 | 9 | 10 | success | pass |
| branch-closures | without | 1 | 273,190 | 5,774 | 14 | 15 | success |  |
| branch-closures | without | 2 | 302,205 | 5,828 | 15 | 16 | success | pass |
| expired-hold-next-in-line | without | 1 | 182,817 | 3,644 | 11 | 12 | success |  |
| expired-hold-next-in-line | without | 2 | 308,318 | 4,955 | 15 | 16 | success | pass |
| sms-notice-length | without | 1 | 269,306 | 3,520 | 13 | 14 | success |  |
| sms-notice-length | without | 2 | 205,403 | 3,921 | 10 | 11 | success | pass |
| hold-queue-order | without | 1 | 217,705 | 3,441 | 10 | 11 | success |  |
| hold-queue-order | without | 2 | 175,960 | 3,006 | 9 | 10 | success | pass |
| selfcheck-card-numbers | without | 1 | 124,723 | 1,916 | 9 | 10 | success |  |
| selfcheck-card-numbers | without | 2 | 147,517 | 2,625 | 7 | 8 | success | pass |
| waived-fees | without | 1 | 202,461 | 2,588 | 10 | 11 | success |  |
| waived-fees | without | 2 | 208,488 | 2,596 | 9 | 10 | success | pass |
| accent-search | without | 1 | 180,017 | 4,030 | 13 | 14 | success |  |
| accent-search | without | 2 | 171,623 | 2,119 | 8 | 9 | success | pass |
| member-loans-route | without | 1 | 197,241 | 3,924 | 11 | 12 | success |  |
| member-loans-route | without | 2 | 204,889 | 4,811 | 11 | 12 | success | pass |
| late-fee-cap | with | 1 | 269,294 | 4,512 | 14 | 15 | success |  |
| late-fee-cap | with | 2 | 225,593 | 2,801 | 11 | 12 | success | pass |
| renewal-waiting-hold | with | 1 | 119,585 | 1,688 | 7 | 8 | success |  |
| renewal-waiting-hold | with | 2 | 216,175 | 3,958 | 11 | 12 | success | pass |
| branch-closures | with | 1 | 199,121 | 3,773 | 13 | 14 | success |  |
| branch-closures | with | 2 | 329,365 | 4,318 | 16 | 17 | success | pass |
| expired-hold-next-in-line | with | 1 | 170,079 | 2,560 | 9 | 10 | success |  |
| expired-hold-next-in-line | with | 2 | 258,952 | 4,889 | 10 | 11 | success | pass |
| sms-notice-length | with | 1 | 211,933 | 3,643 | 16 | 17 | success |  |
| sms-notice-length | with | 2 | 217,223 | 4,262 | 11 | 12 | success | pass |
| hold-queue-order | with | 1 | 174,742 | 2,564 | 9 | 10 | success |  |
| hold-queue-order | with | 2 | 226,508 | 2,705 | 10 | 11 | success | pass |
| selfcheck-card-numbers | with | 1 | 182,077 | 2,258 | 9 | 10 | success |  |
| selfcheck-card-numbers | with | 2 | 184,772 | 3,387 | 11 | 12 | success | pass |
| waived-fees | with | 1 | 197,949 | 2,536 | 12 | 13 | success |  |
| waived-fees | with | 2 | 176,725 | 2,424 | 9 | 10 | success | pass |
| accent-search | with | 1 | 186,590 | 3,092 | 11 | 12 | success |  |
| accent-search | with | 2 | 122,623 | 2,054 | 8 | 9 | success | pass |
| member-loans-route | with | 1 | 212,302 | 2,914 | 11 | 12 | success |  |
| member-loans-route | with | 2 | 220,477 | 3,586 | 16 | 17 | success | pass |

## How it was run

- Without Kronomind, started 2026-11-27T06:12:33.624Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*`
- With Kronomind, started 2026-11-28T02:59:39.466Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__kronomind__* --settings {"autoMemoryEnabled":false,"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$KRONOMIND_COMPARISON_NODE\" \"$KRONOMIND_COMPARISON_SERVER_ENTRY\" hook recall"}]}],"SessionStart":[{"matcher":"startup","hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$KRONOMIND_COMPARISON_NODE\" \"$KRONOMIND_COMPARISON_SERVER_ENTRY\" maintenance > /dev/null"}]}]}} --mcp-config <mcp-config.json>`

## Changes to the task set

None since the task set was committed.
