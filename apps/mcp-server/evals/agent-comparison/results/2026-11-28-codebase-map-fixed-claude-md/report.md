# Token and tool-call comparison with and without Kronomind

| | |
|---|---|
| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |
| Model | claude-sonnet-5-5 (without); claude-sonnet-5-5 (with) |
| Date | 2026-11-27 (without); 2026-11-28 (with) |
| Tasks | 10 in the set of code base map tasks of FL-082, the run without Kronomind starting from a hand-written CLAUDE.md map, 10 compared; each in two sessions per configuration |

## Result

No clear difference. With Kronomind, the median task's tokens, input and output together, changed by +6.9%, which is inside the 10% either way that this report counts as no clear difference; it made 3.5 more tool calls, and 10 of 10 checks passed with Kronomind and 10 of 10 without it.

10 tasks show a direction, not a law: this is not a claim of statistical significance.

Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.

## Totals

| Figure | Without Kronomind | With Kronomind | Difference |
|---|---|---|---|
| Input tokens | 4,044,142 | 4,102,085 | +57,943 |
| of which read from the cache | 3,672,611 | 3,744,915 | +72,304 |
| Output tokens | 69,587 | 63,924 | -5,663 |
| Tool calls | 217 | 224 | +7 |
| Checks passed | 10 of 10 | 10 of 10 | 0 |

## Medians

| Figure | Median of the per-task differences, with minus without |
|---|---|
| Input tokens | +25,938 |
| Output tokens | -113.5 |
| Tool calls | +3.5 |
| Input and output tokens, as a share of the figure without | +6.9% |

## Per task

| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |
|---|---|---|---|---|---|---|---|---|---|
| late-fee-cap | 407,557 | 494,887 | 5,672 | 7,313 | 19 | 25 | pass | pass | +21.5% |
| renewal-waiting-hold | 325,828 | 335,760 | 6,278 | 5,646 | 19 | 18 | pass | pass | +2.8% |
| branch-closures | 693,514 | 528,486 | 14,614 | 8,091 | 42 | 29 | pass | pass | -24.2% |
| expired-hold-next-in-line | 443,245 | 429,031 | 8,025 | 7,449 | 22 | 19 | pass | pass | -3.3% |
| sms-notice-length | 501,799 | 429,156 | 8,791 | 7,905 | 30 | 27 | pass | pass | -14.4% |
| hold-queue-order | 342,701 | 401,250 | 4,702 | 5,269 | 15 | 19 | pass | pass | +17.0% |
| selfcheck-card-numbers | 340,288 | 366,849 | 4,696 | 5,645 | 16 | 20 | pass | pass | +8.0% |
| waived-fees | 331,238 | 374,674 | 4,611 | 4,960 | 17 | 21 | pass | pass | +13.0% |
| accent-search | 250,508 | 309,213 | 4,546 | 5,146 | 16 | 19 | pass | pass | +23.3% |
| member-loans-route | 407,464 | 432,779 | 7,652 | 6,500 | 21 | 27 | pass | pass | +5.8% |

## Tool calls by tool

| Tool | Without Kronomind | With Kronomind |
|---|---|---|
| `Bash` | 94 | 87 |
| `Edit` | 66 | 65 |
| `Read` | 56 | 60 |
| `ToolSearch` | 0 | 6 |
| `Write` | 1 | 0 |
| `bash` | 0 | 1 |
| `mcp__kronomind__invalidate_fact` | 0 | 2 |
| `mcp__kronomind__record_fact` | 0 | 3 |

## Sessions

| Task | Configuration | Session | Input tokens | Output tokens | Tool calls | Turns | Result | Check |
|---|---|---|---|---|---|---|---|---|
| late-fee-cap | without | 1 | 216,314 | 2,962 | 10 | 11 | success |  |
| late-fee-cap | without | 2 | 191,243 | 2,710 | 9 | 10 | success | pass |
| renewal-waiting-hold | without | 1 | 126,366 | 1,560 | 7 | 8 | success |  |
| renewal-waiting-hold | without | 2 | 199,462 | 4,718 | 12 | 13 | success | pass |
| branch-closures | without | 1 | 315,552 | 7,358 | 20 | 21 | success |  |
| branch-closures | without | 2 | 377,962 | 7,256 | 22 | 23 | success | pass |
| expired-hold-next-in-line | without | 1 | 177,560 | 2,527 | 9 | 10 | success |  |
| expired-hold-next-in-line | without | 2 | 265,685 | 5,498 | 13 | 14 | success | pass |
| sms-notice-length | without | 1 | 258,722 | 4,783 | 17 | 18 | success |  |
| sms-notice-length | without | 2 | 243,077 | 4,008 | 13 | 14 | success | pass |
| hold-queue-order | without | 1 | 181,944 | 2,615 | 8 | 9 | success |  |
| hold-queue-order | without | 2 | 160,757 | 2,087 | 7 | 8 | success | pass |
| selfcheck-card-numbers | without | 1 | 151,634 | 1,648 | 8 | 9 | success |  |
| selfcheck-card-numbers | without | 2 | 188,654 | 3,048 | 8 | 9 | success | pass |
| waived-fees | without | 1 | 206,110 | 2,737 | 9 | 10 | success |  |
| waived-fees | without | 2 | 125,128 | 1,874 | 8 | 9 | success | pass |
| accent-search | without | 1 | 99,886 | 2,357 | 8 | 9 | success |  |
| accent-search | without | 2 | 150,622 | 2,189 | 8 | 9 | success | pass |
| member-loans-route | without | 1 | 204,314 | 3,456 | 11 | 12 | success |  |
| member-loans-route | without | 2 | 203,150 | 4,196 | 10 | 11 | success | pass |
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

- Without Kronomind, started 2026-11-27T06:42:04.275Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*`
- With Kronomind, started 2026-11-28T02:59:39.466Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__kronomind__* --settings {"autoMemoryEnabled":false,"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$KRONOMIND_COMPARISON_NODE\" \"$KRONOMIND_COMPARISON_SERVER_ENTRY\" hook recall"}]}],"SessionStart":[{"matcher":"startup","hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$KRONOMIND_COMPARISON_NODE\" \"$KRONOMIND_COMPARISON_SERVER_ENTRY\" maintenance > /dev/null"}]}]}} --mcp-config <mcp-config.json>`

## Changes to the task set

None since the task set was committed.
