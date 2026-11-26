# Token and tool-call comparison with and without Factloom

| | |
|---|---|
| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |
| Model | claude-sonnet-5-5 (without); claude-sonnet-5-5 (with) |
| Date | 2026-11-26 (without); 2026-11-26 (with) |
| Tasks | 10 in the set, 10 compared; each in two sessions per configuration |

## Result

No clear difference. With Factloom, the median task's tokens, input and output together, changed by -0.5%, which is inside the 10% either way that this report counts as no clear difference; it made 1.5 fewer tool calls, and 10 of 10 checks passed with Factloom and 10 of 10 without it.

10 tasks show a direction, not a law: this is not a claim of statistical significance.

Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.

## Totals

| Figure | Without Factloom | With Factloom | Difference |
|---|---|---|---|
| Input tokens | 1,859,692 | 1,875,379 | +15,687 |
| of which read from the cache | 1,623,381 | 1,637,220 | +13,839 |
| Output tokens | 30,495 | 26,974 | -3,521 |
| Tool calls | 96 | 91 | -5 |
| Checks passed | 10 of 10 | 10 of 10 | 0 |

## Medians

| Figure | Median of the per-task differences, with minus without |
|---|---|
| Input tokens | -322 |
| Output tokens | -256.5 |
| Tool calls | -1.5 |
| Input and output tokens, as a share of the figure without | -0.5% |

## Per task

| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |
|---|---|---|---|---|---|---|---|---|---|
| refund-rounding | 140,243 | 139,841 | 2,531 | 1,878 | 5 | 4 | pass | pass | -0.7% |
| error-body | 188,310 | 210,113 | 2,876 | 2,648 | 12 | 10 | pass | pass | +11.3% |
| utc-dates | 208,338 | 206,775 | 3,611 | 2,634 | 11 | 10 | pass | pass | -1.2% |
| invoice-number | 136,387 | 136,145 | 1,951 | 1,833 | 8 | 6 | pass | pass | -0.3% |
| database-variable | 182,626 | 158,507 | 2,702 | 2,417 | 11 | 8 | pass | pass | -13.2% |
| currency-from-region | 274,681 | 279,615 | 4,574 | 5,178 | 12 | 18 | pass | pass | +2.0% |
| wholesale-tax | 214,217 | 186,547 | 4,209 | 2,174 | 12 | 9 | pass | pass | -13.6% |
| no-personal-data-in-logs | 137,031 | 135,304 | 1,673 | 1,253 | 6 | 4 | pass | pass | -1.5% |
| export-sorted-by-id | 159,038 | 180,972 | 2,138 | 2,314 | 7 | 7 | pass | pass | +13.7% |
| calendar-dates-in-responses | 218,821 | 241,560 | 4,230 | 4,645 | 12 | 15 | pass | pass | +10.4% |

## Tool calls by tool

| Tool | Without Factloom | With Factloom |
|---|---|---|
| `Bash` | 31 | 32 |
| `Edit` | 16 | 19 |
| `Read` | 24 | 12 |
| `ToolSearch` | 0 | 10 |
| `Write` | 25 | 3 |
| `bash` | 0 | 1 |
| `mcp__factloom__recall` | 0 | 1 |
| `mcp__factloom__record_fact` | 0 | 13 |

## Sessions

| Task | Configuration | Session | Input tokens | Output tokens | Tool calls | Turns | Result | Check |
|---|---|---|---|---|---|---|---|---|
| refund-rounding | without | 1 | 68,892 | 921 | 3 | 4 | success |  |
| refund-rounding | without | 2 | 71,351 | 1,610 | 2 | 3 | success | pass |
| error-body | without | 1 | 67,012 | 943 | 3 | 4 | success |  |
| error-body | without | 2 | 121,298 | 1,933 | 9 | 10 | success | pass |
| utc-dates | without | 1 | 66,846 | 1,159 | 3 | 4 | success |  |
| utc-dates | without | 2 | 141,492 | 2,452 | 8 | 9 | success | pass |
| invoice-number | without | 1 | 66,935 | 895 | 3 | 4 | success |  |
| invoice-number | without | 2 | 69,452 | 1,056 | 5 | 6 | success | pass |
| database-variable | without | 1 | 66,793 | 840 | 3 | 4 | success |  |
| database-variable | without | 2 | 115,833 | 1,862 | 8 | 9 | success | pass |
| currency-from-region | without | 1 | 66,999 | 1,097 | 3 | 4 | success |  |
| currency-from-region | without | 2 | 207,682 | 3,477 | 9 | 10 | success | pass |
| wholesale-tax | without | 1 | 66,740 | 822 | 3 | 4 | success |  |
| wholesale-tax | without | 2 | 147,477 | 3,387 | 9 | 10 | success | pass |
| no-personal-data-in-logs | without | 1 | 66,784 | 808 | 3 | 4 | success |  |
| no-personal-data-in-logs | without | 2 | 70,247 | 865 | 3 | 4 | success | pass |
| export-sorted-by-id | without | 1 | 66,891 | 900 | 3 | 4 | success |  |
| export-sorted-by-id | without | 2 | 92,147 | 1,238 | 4 | 5 | success | pass |
| calendar-dates-in-responses | without | 1 | 66,615 | 1,077 | 3 | 4 | success |  |
| calendar-dates-in-responses | without | 2 | 152,206 | 3,153 | 9 | 10 | success | pass |
| refund-rounding | with | 1 | 72,079 | 653 | 2 | 3 | success |  |
| refund-rounding | with | 2 | 67,762 | 1,225 | 2 | 3 | success | pass |
| error-body | with | 1 | 68,617 | 661 | 2 | 3 | success |  |
| error-body | with | 2 | 141,496 | 1,987 | 8 | 9 | success | pass |
| utc-dates | with | 1 | 92,294 | 831 | 3 | 4 | success |  |
| utc-dates | with | 2 | 114,481 | 1,803 | 7 | 8 | success | pass |
| invoice-number | with | 1 | 68,618 | 776 | 2 | 3 | success |  |
| invoice-number | with | 2 | 67,527 | 1,057 | 4 | 5 | success | pass |
| database-variable | with | 1 | 68,473 | 621 | 2 | 3 | success |  |
| database-variable | with | 2 | 90,034 | 1,796 | 6 | 7 | success | pass |
| currency-from-region | with | 1 | 69,226 | 1,161 | 3 | 4 | success |  |
| currency-from-region | with | 2 | 210,389 | 4,017 | 15 | 16 | success | pass |
| wholesale-tax | with | 1 | 68,340 | 574 | 2 | 3 | success |  |
| wholesale-tax | with | 2 | 118,207 | 1,600 | 7 | 8 | success | pass |
| no-personal-data-in-logs | with | 1 | 67,373 | 558 | 2 | 3 | success |  |
| no-personal-data-in-logs | with | 2 | 67,931 | 695 | 2 | 3 | success | pass |
| export-sorted-by-id | with | 1 | 68,788 | 847 | 3 | 4 | success |  |
| export-sorted-by-id | with | 2 | 112,184 | 1,467 | 4 | 5 | success | pass |
| calendar-dates-in-responses | with | 1 | 69,240 | 1,127 | 3 | 4 | success |  |
| calendar-dates-in-responses | with | 2 | 172,320 | 3,518 | 12 | 13 | success | pass |

## How it was run

- Without Factloom, started 2026-11-26T09:27:00.528Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*`
- With Factloom, started 2026-11-26T15:25:22.179Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__* --settings {"autoMemoryEnabled":false,"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" hook recall"}]}]}} --mcp-config <mcp-config.json>`

## Changes to the task set

None since the task set was committed.
