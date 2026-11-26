# Token and tool-call comparison with and without Factloom

| | |
|---|---|
| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |
| Model | claude-sonnet-5-5 (without); claude-sonnet-5-5 (with) |
| Date | 2026-11-26 (without); 2026-11-26 (with) |
| Tasks | 10 in the set, 10 compared; each in two sessions per configuration |

## Result

A cost. Fewer checks passed with Factloom: 9 of 10 checks passed with Factloom and 10 of 10 without it. A cheaper answer that fails its check is not a saving, so the change in tokens, +17.7% for the median task, does not count as one.

10 tasks show a direction, not a law: this is not a claim of statistical significance.

Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.

## Totals

| Figure | Without Factloom | With Factloom | Difference |
|---|---|---|---|
| Input tokens | 1,859,692 | 2,039,567 | +179,875 |
| of which read from the cache | 1,623,381 | 1,785,432 | +162,051 |
| Output tokens | 30,495 | 31,653 | +1,158 |
| Tool calls | 96 | 116 | +20 |
| Checks passed | 10 of 10 | 9 of 10 | -1 |

## Medians

| Figure | Median of the per-task differences, with minus without |
|---|---|
| Input tokens | +30,036.5 |
| Output tokens | +303.5 |
| Tool calls | +2 |
| Input and output tokens, as a share of the figure without | +17.7% |

## Per task

| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |
|---|---|---|---|---|---|---|---|---|---|
| refund-rounding | 140,243 | 192,795 | 2,531 | 3,014 | 5 | 9 | pass | pass | +37.1% |
| error-body | 188,310 | 216,079 | 2,876 | 3,377 | 12 | 11 | pass | pass | +14.8% |
| utc-dates | 208,338 | 186,669 | 3,611 | 3,454 | 11 | 11 | pass | pass | -10.3% |
| invoice-number | 136,387 | 165,459 | 1,951 | 2,363 | 8 | 8 | pass | pass | +21.3% |
| database-variable | 182,626 | 157,519 | 2,702 | 2,138 | 11 | 8 | pass | fail | -13.9% |
| currency-from-region | 274,681 | 218,929 | 4,574 | 3,769 | 12 | 16 | pass | pass | -20.3% |
| wholesale-tax | 214,217 | 268,424 | 4,209 | 3,749 | 12 | 13 | pass | pass | +24.6% |
| no-personal-data-in-logs | 137,031 | 191,719 | 1,673 | 2,284 | 6 | 10 | pass | pass | +39.9% |
| export-sorted-by-id | 159,038 | 192,152 | 2,138 | 2,333 | 7 | 10 | pass | pass | +20.7% |
| calendar-dates-in-responses | 218,821 | 249,822 | 4,230 | 5,172 | 12 | 20 | pass | pass | +14.3% |

## Tool calls by tool

| Tool | Without Factloom | With Factloom |
|---|---|---|
| `Bash` | 31 | 32 |
| `Edit` | 16 | 20 |
| `Read` | 24 | 12 |
| `ToolSearch` | 0 | 16 |
| `Write` | 25 | 9 |
| `mcp__factloom__recall` | 0 | 14 |
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
| refund-rounding | with | 1 | 68,498 | 711 | 2 | 3 | success |  |
| refund-rounding | with | 2 | 124,297 | 2,303 | 7 | 8 | success | pass |
| error-body | with | 1 | 68,923 | 886 | 3 | 4 | success |  |
| error-body | with | 2 | 147,156 | 2,491 | 8 | 9 | success | pass |
| utc-dates | with | 1 | 68,692 | 652 | 2 | 3 | success |  |
| utc-dates | with | 2 | 117,977 | 2,802 | 9 | 10 | success | pass |
| invoice-number | with | 1 | 68,537 | 706 | 2 | 3 | success |  |
| invoice-number | with | 2 | 96,922 | 1,657 | 6 | 7 | success | pass |
| database-variable | with | 1 | 68,476 | 679 | 2 | 3 | success |  |
| database-variable | with | 2 | 89,043 | 1,459 | 6 | 7 | success | fail |
| currency-from-region | with | 1 | 92,542 | 1,078 | 4 | 5 | success |  |
| currency-from-region | with | 2 | 126,387 | 2,691 | 12 | 13 | success | pass |
| wholesale-tax | with | 1 | 67,313 | 553 | 2 | 3 | success |  |
| wholesale-tax | with | 2 | 201,111 | 3,196 | 11 | 12 | success | pass |
| no-personal-data-in-logs | with | 1 | 67,387 | 535 | 2 | 3 | success |  |
| no-personal-data-in-logs | with | 2 | 124,332 | 1,749 | 8 | 9 | success | pass |
| export-sorted-by-id | with | 1 | 68,343 | 510 | 2 | 3 | success |  |
| export-sorted-by-id | with | 2 | 123,809 | 1,823 | 8 | 9 | success | pass |
| calendar-dates-in-responses | with | 1 | 92,596 | 1,028 | 4 | 5 | success |  |
| calendar-dates-in-responses | with | 2 | 157,226 | 4,144 | 16 | 17 | success | pass |

## How it was run

- Without Factloom, started 2026-11-26T09:27:00.528Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*`
- With Factloom, started 2026-11-26T11:56:48.193Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__* --settings {"autoMemoryEnabled":false} --mcp-config <mcp-config.json>`

## Changes to the task set

None since the task set was committed.
