# Token and tool-call comparison with and without Factloom

| | |
|---|---|
| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |
| Model | claude-sonnet-5-5 (without); claude-sonnet-5-5 (with) |
| Date | 2026-11-27 (without); 2026-11-27 (with) |
| Tasks | 10 in the set of code base map tasks of FL-082, the run without Factloom starting from a hand-written CLAUDE.md map, 10 compared; each in two sessions per configuration |

## Result

No clear difference. With Factloom, the median task's tokens, input and output together, changed by -0.7%, which is inside the 10% either way that this report counts as no clear difference; it made 1.5 more tool calls, and 10 of 10 checks passed with Factloom and 10 of 10 without it.

10 tasks show a direction, not a law: this is not a claim of statistical significance.

Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.

## Totals

| Figure | Without Factloom | With Factloom | Difference |
|---|---|---|---|
| Input tokens | 4,044,142 | 3,853,674 | -190,468 |
| of which read from the cache | 3,672,611 | 3,508,505 | -164,106 |
| Output tokens | 69,587 | 62,657 | -6,930 |
| Tool calls | 217 | 219 | +2 |
| Checks passed | 10 of 10 | 10 of 10 | 0 |

## Medians

| Figure | Median of the per-task differences, with minus without |
|---|---|
| Input tokens | -2,187.5 |
| Output tokens | -340 |
| Tool calls | +1.5 |
| Input and output tokens, as a share of the figure without | -0.7% |

## Per task

| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |
|---|---|---|---|---|---|---|---|---|---|
| late-fee-cap | 407,557 | 415,439 | 5,672 | 5,262 | 19 | 22 | pass | pass | +1.8% |
| renewal-waiting-hold | 325,828 | 361,734 | 6,278 | 5,694 | 19 | 19 | pass | pass | +10.6% |
| branch-closures | 693,514 | 440,181 | 14,614 | 9,170 | 42 | 27 | pass | pass | -36.5% |
| expired-hold-next-in-line | 443,245 | 394,969 | 8,025 | 6,872 | 22 | 20 | pass | pass | -11.0% |
| sms-notice-length | 501,799 | 514,809 | 8,791 | 8,521 | 30 | 31 | pass | pass | +2.5% |
| hold-queue-order | 342,701 | 330,444 | 4,702 | 5,696 | 15 | 17 | pass | pass | -3.2% |
| selfcheck-card-numbers | 340,288 | 308,026 | 4,696 | 4,903 | 16 | 17 | pass | pass | -9.3% |
| waived-fees | 331,238 | 425,503 | 4,611 | 5,140 | 17 | 21 | pass | pass | +28.2% |
| accent-search | 250,508 | 319,598 | 4,546 | 5,147 | 16 | 20 | pass | pass | +27.3% |
| member-loans-route | 407,464 | 342,971 | 7,652 | 6,252 | 21 | 25 | pass | pass | -15.9% |

## Tool calls by tool

| Tool | Without Factloom | With Factloom |
|---|---|---|
| `Bash` | 94 | 88 |
| `Edit` | 66 | 67 |
| `Read` | 56 | 59 |
| `ToolSearch` | 0 | 1 |
| `Write` | 1 | 0 |
| `bash` | 0 | 1 |
| `mcp__factloom__record_fact` | 0 | 3 |

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

- Without Factloom, started 2026-11-27T06:42:04.275Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*`
- With Factloom, started 2026-11-27T10:09:40.170Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__* --settings {"autoMemoryEnabled":false,"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" hook recall"}]}],"SessionStart":[{"matcher":"startup","hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" maintenance > /dev/null"}]}]}} --mcp-config <mcp-config.json>`

## Changes to the task set

None since the task set was committed.
