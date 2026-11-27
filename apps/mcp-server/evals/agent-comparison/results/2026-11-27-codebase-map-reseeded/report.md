# Token and tool-call comparison with and without Factloom

| | |
|---|---|
| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |
| Model | claude-sonnet-5-5 (without); claude-sonnet-5-5 (with) |
| Date | 2026-11-27 (without); 2026-11-27 (with) |
| Tasks | 10 in the set of code base map tasks of FL-082, 10 compared; each in two sessions per configuration |

## Result

A saving. With Factloom, the median task used 10.5% fewer tokens, input and output together, and 0.5 more tool calls; 10 of 10 checks passed with Factloom and 10 of 10 without it.

10 tasks show a direction, not a law: this is not a claim of statistical significance.

Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.

## Totals

| Figure | Without Factloom | With Factloom | Difference |
|---|---|---|---|
| Input tokens | 4,182,772 | 3,853,674 | -329,098 |
| of which read from the cache | 3,806,932 | 3,508,505 | -298,427 |
| Output tokens | 71,567 | 62,657 | -8,910 |
| Tool calls | 215 | 219 | +4 |
| Checks passed | 10 of 10 | 10 of 10 | 0 |

## Medians

| Figure | Median of the per-task differences, with minus without |
|---|---|
| Input tokens | -43,717.5 |
| Output tokens | -876.5 |
| Tool calls | +0.5 |
| Input and output tokens, as a share of the figure without | -10.5% |

## Per task

| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |
|---|---|---|---|---|---|---|---|---|---|
| late-fee-cap | 470,832 | 415,439 | 6,446 | 5,262 | 22 | 22 | pass | pass | -11.9% |
| renewal-waiting-hold | 340,077 | 361,734 | 6,423 | 5,694 | 18 | 19 | pass | pass | +6.0% |
| branch-closures | 575,395 | 440,181 | 11,602 | 9,170 | 29 | 27 | pass | pass | -23.4% |
| expired-hold-next-in-line | 491,135 | 394,969 | 8,599 | 6,872 | 26 | 20 | pass | pass | -19.6% |
| sms-notice-length | 474,709 | 514,809 | 7,441 | 8,521 | 23 | 31 | pass | pass | +8.5% |
| hold-queue-order | 393,665 | 330,444 | 6,447 | 5,696 | 19 | 17 | pass | pass | -16.0% |
| selfcheck-card-numbers | 272,240 | 308,026 | 4,541 | 4,903 | 16 | 17 | pass | pass | +13.1% |
| waived-fees | 410,949 | 425,503 | 5,184 | 5,140 | 19 | 21 | pass | pass | +3.5% |
| accent-search | 351,640 | 319,598 | 6,149 | 5,147 | 21 | 20 | pass | pass | -9.2% |
| member-loans-route | 402,130 | 342,971 | 8,735 | 6,252 | 22 | 25 | pass | pass | -15.0% |

## Tool calls by tool

| Tool | Without Factloom | With Factloom |
|---|---|---|
| `Bash` | 102 | 88 |
| `Edit` | 67 | 67 |
| `Read` | 44 | 59 |
| `ToolSearch` | 0 | 1 |
| `Write` | 1 | 0 |
| `bash` | 1 | 1 |
| `mcp__factloom__record_fact` | 0 | 3 |

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
| late-fee-cap | with | 1 | 190,001 | 2,579 | 10 | 11 | success |  |
| late-fee-cap | with | 2 | 225,438 | 2,683 | 12 | 13 | success | pass |
| renewal-waiting-hold | with | 1 | 120,542 | 1,727 | 7 | 8 | success |  |
| renewal-waiting-hold | with | 2 | 241,192 | 3,967 | 12 | 13 | success | pass |
| branch-closures | with | 1 | 187,180 | 4,210 | 14 | 15 | success |  |
| branch-closures | with | 2 | 253,001 | 4,960 | 13 | 14 | success | pass |
| expired-hold-next-in-line | with | 1 | 172,338 | 2,524 | 9 | 10 | success |  |
| expired-hold-next-in-line | with | 2 | 222,631 | 4,348 | 11 | 12 | success | pass |
| sms-notice-length | with | 1 | 301,240 | 3,936 | 18 | 19 | success |  |
| sms-notice-length | with | 2 | 213,569 | 4,585 | 13 | 14 | success | pass |
| hold-queue-order | with | 1 | 176,375 | 2,507 | 10 | 11 | success |  |
| hold-queue-order | with | 2 | 154,069 | 3,189 | 7 | 8 | success | pass |
| selfcheck-card-numbers | with | 1 | 151,993 | 2,043 | 9 | 10 | success |  |
| selfcheck-card-numbers | with | 2 | 156,033 | 2,860 | 8 | 9 | success | pass |
| waived-fees | with | 1 | 222,081 | 2,543 | 11 | 12 | success |  |
| waived-fees | with | 2 | 203,422 | 2,597 | 10 | 11 | success | pass |
| accent-search | with | 1 | 150,934 | 3,065 | 11 | 12 | success |  |
| accent-search | with | 2 | 168,664 | 2,082 | 9 | 10 | success | pass |
| member-loans-route | with | 1 | 183,348 | 2,668 | 10 | 11 | success |  |
| member-loans-route | with | 2 | 159,623 | 3,584 | 15 | 16 | success | pass |

## How it was run

- Without Factloom, started 2026-11-27T06:12:33.624Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*`
- With Factloom, started 2026-11-27T10:09:40.170Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__* --settings {"autoMemoryEnabled":false,"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" hook recall"}]}],"SessionStart":[{"matcher":"startup","hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" maintenance > /dev/null"}]}]}} --mcp-config <mcp-config.json>`

## Changes to the task set

None since the task set was committed.
