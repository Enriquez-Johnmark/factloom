# Token and tool-call comparison with and without Factloom

| | |
|---|---|
| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |
| Model | claude-sonnet-5-5 (without); claude-sonnet-5-5 (with) |
| Date | 2026-11-27 (without); 2026-11-27 (with) |
| Tasks | 10 in the set of code base map tasks of FL-082, 10 compared; each in two sessions per configuration |

## Result

No clear difference. With Factloom, the median task's tokens, input and output together, changed by -4.6%, which is inside the 10% either way that this report counts as no clear difference; it made 0.5 more tool calls, and 10 of 10 checks passed with Factloom and 10 of 10 without it.

10 tasks show a direction, not a law: this is not a claim of statistical significance.

Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.

## Totals

| Figure | Without Factloom | With Factloom | Difference |
|---|---|---|---|
| Input tokens | 4,182,772 | 3,866,020 | -316,752 |
| of which read from the cache | 3,806,932 | 3,516,353 | -290,579 |
| Output tokens | 71,567 | 64,479 | -7,088 |
| Tool calls | 215 | 209 | -6 |
| Checks passed | 10 of 10 | 10 of 10 | 0 |

## Medians

| Figure | Median of the per-task differences, with minus without |
|---|---|
| Input tokens | -20,822 |
| Output tokens | -479.5 |
| Tool calls | +0.5 |
| Input and output tokens, as a share of the figure without | -4.6% |

## Per task

| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |
|---|---|---|---|---|---|---|---|---|---|
| late-fee-cap | 470,832 | 439,025 | 6,446 | 6,064 | 22 | 23 | pass | pass | -6.7% |
| renewal-waiting-hold | 340,077 | 339,351 | 6,423 | 5,846 | 18 | 19 | pass | pass | -0.4% |
| branch-closures | 575,395 | 480,961 | 11,602 | 9,110 | 29 | 22 | pass | pass | -16.5% |
| expired-hold-next-in-line | 491,135 | 304,021 | 8,599 | 6,035 | 26 | 16 | pass | pass | -38.0% |
| sms-notice-length | 474,709 | 422,137 | 7,441 | 7,076 | 23 | 27 | pass | pass | -11.0% |
| hold-queue-order | 393,665 | 396,564 | 6,447 | 5,720 | 19 | 17 | pass | pass | +0.5% |
| selfcheck-card-numbers | 272,240 | 432,660 | 4,541 | 6,586 | 16 | 25 | pass | pass | +58.7% |
| waived-fees | 410,949 | 401,112 | 5,184 | 4,819 | 19 | 19 | pass | pass | -2.5% |
| accent-search | 351,640 | 243,598 | 6,149 | 6,334 | 21 | 15 | pass | pass | -30.1% |
| member-loans-route | 402,130 | 406,591 | 8,735 | 6,889 | 22 | 26 | pass | pass | +0.6% |

## Tool calls by tool

| Tool | Without Factloom | With Factloom |
|---|---|---|
| `Bash` | 102 | 81 |
| `Edit` | 67 | 66 |
| `Read` | 44 | 57 |
| `ToolSearch` | 0 | 2 |
| `Write` | 1 | 1 |
| `bash` | 1 | 0 |
| `mcp__factloom__record_fact` | 0 | 2 |

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
| late-fee-cap | with | 1 | 226,126 | 3,160 | 12 | 13 | success |  |
| late-fee-cap | with | 2 | 212,899 | 2,904 | 11 | 12 | success | pass |
| renewal-waiting-hold | with | 1 | 150,832 | 2,139 | 8 | 9 | success |  |
| renewal-waiting-hold | with | 2 | 188,519 | 3,707 | 11 | 12 | success | pass |
| branch-closures | with | 1 | 259,089 | 5,378 | 13 | 14 | success |  |
| branch-closures | with | 2 | 221,872 | 3,732 | 9 | 10 | success | pass |
| expired-hold-next-in-line | with | 1 | 172,340 | 2,145 | 8 | 9 | success |  |
| expired-hold-next-in-line | with | 2 | 131,681 | 3,890 | 8 | 9 | success | pass |
| sms-notice-length | with | 1 | 239,963 | 3,644 | 17 | 18 | success |  |
| sms-notice-length | with | 2 | 182,174 | 3,432 | 10 | 11 | success | pass |
| hold-queue-order | with | 1 | 245,385 | 3,357 | 10 | 11 | success |  |
| hold-queue-order | with | 2 | 151,179 | 2,363 | 7 | 8 | success | pass |
| selfcheck-card-numbers | with | 1 | 186,325 | 2,926 | 12 | 13 | success |  |
| selfcheck-card-numbers | with | 2 | 246,335 | 3,660 | 13 | 14 | success | pass |
| waived-fees | with | 1 | 224,358 | 2,627 | 11 | 12 | success |  |
| waived-fees | with | 2 | 176,754 | 2,192 | 8 | 9 | success | pass |
| accent-search | with | 1 | 119,146 | 3,669 | 7 | 8 | success |  |
| accent-search | with | 2 | 124,452 | 2,665 | 8 | 9 | success | pass |
| member-loans-route | with | 1 | 184,842 | 3,099 | 9 | 10 | success |  |
| member-loans-route | with | 2 | 221,749 | 3,790 | 17 | 18 | success | pass |

## How it was run

- Without Factloom, started 2026-11-27T06:12:33.624Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*`
- With Factloom, started 2026-11-27T08:24:06.612Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__* --settings {"autoMemoryEnabled":false,"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" hook recall"}]}],"SessionStart":[{"matcher":"startup","hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" maintenance > /dev/null"}]}]}} --mcp-config <mcp-config.json>`

## Changes to the task set

None since the task set was committed.
