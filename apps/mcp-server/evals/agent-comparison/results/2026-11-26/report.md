# Token and tool-call comparison with and without Factloom

| | |
|---|---|
| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |
| Model | claude-sonnet-5-5 (without); claude-sonnet-5-5 (with) |
| Date | 2026-11-26 (without); 2026-11-26 (with) |
| Tasks | 10 in the set, 10 compared; each in two sessions per configuration |

## Result

No clear difference. With Factloom, the median task's tokens, input and output together, changed by +1.8%, which is inside the 10% either way that this report counts as no clear difference; it made as many tool calls, and 10 of 10 checks passed with Factloom and 10 of 10 without it.

10 tasks show a direction, not a law: this is not a claim of statistical significance.

Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.

## Totals

| Figure | Without Factloom | With Factloom | Difference |
|---|---|---|---|
| Input tokens | 1,859,692 | 1,837,695 | -21,997 |
| of which read from the cache | 1,623,381 | 1,593,680 | -29,701 |
| Output tokens | 30,495 | 33,868 | +3,373 |
| Tool calls | 96 | 98 | +2 |
| Checks passed | 10 of 10 | 10 of 10 | 0 |

## Medians

| Figure | Median of the per-task differences, with minus without |
|---|---|
| Input tokens | +2,717.5 |
| Output tokens | +456.5 |
| Tool calls | 0 |
| Input and output tokens, as a share of the figure without | +1.8% |

## Per task

| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |
|---|---|---|---|---|---|---|---|---|---|
| refund-rounding | 140,243 | 214,525 | 2,531 | 4,438 | 5 | 9 | pass | pass | +53.4% |
| error-body | 188,310 | 213,289 | 2,876 | 3,538 | 12 | 10 | pass | pass | +13.4% |
| utc-dates | 208,338 | 137,068 | 3,611 | 2,350 | 11 | 7 | pass | pass | -34.2% |
| invoice-number | 136,387 | 138,819 | 1,951 | 2,410 | 8 | 8 | pass | pass | +2.1% |
| database-variable | 182,626 | 161,003 | 2,702 | 2,324 | 11 | 9 | pass | pass | -11.9% |
| currency-from-region | 274,681 | 229,639 | 4,574 | 5,389 | 12 | 16 | pass | pass | -15.8% |
| wholesale-tax | 214,217 | 217,390 | 4,209 | 4,190 | 12 | 13 | pass | pass | +1.4% |
| no-personal-data-in-logs | 137,031 | 138,975 | 1,673 | 1,837 | 6 | 5 | pass | pass | +1.5% |
| export-sorted-by-id | 159,038 | 162,041 | 2,138 | 2,708 | 7 | 7 | pass | pass | +2.2% |
| calendar-dates-in-responses | 218,821 | 224,946 | 4,230 | 4,684 | 12 | 14 | pass | pass | +2.9% |

## Tool calls by tool

| Tool | Without Factloom | With Factloom |
|---|---|---|
| `Bash` | 31 | 32 |
| `Edit` | 16 | 17 |
| `Read` | 24 | 24 |
| `Write` | 25 | 25 |

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
| refund-rounding | with | 1 | 68,552 | 1,427 | 3 | 4 | success |  |
| refund-rounding | with | 2 | 145,973 | 3,011 | 6 | 7 | success | pass |
| error-body | with | 1 | 68,336 | 1,410 | 3 | 4 | success |  |
| error-body | with | 2 | 144,953 | 2,128 | 7 | 8 | success | pass |
| utc-dates | with | 1 | 68,297 | 1,364 | 3 | 4 | success |  |
| utc-dates | with | 2 | 68,771 | 986 | 4 | 5 | success | pass |
| invoice-number | with | 1 | 68,178 | 1,337 | 3 | 4 | success |  |
| invoice-number | with | 2 | 70,641 | 1,073 | 5 | 6 | success | pass |
| database-variable | with | 1 | 67,708 | 1,036 | 3 | 4 | success |  |
| database-variable | with | 2 | 93,295 | 1,288 | 6 | 7 | success | pass |
| currency-from-region | with | 1 | 68,122 | 1,298 | 3 | 4 | success |  |
| currency-from-region | with | 2 | 161,517 | 4,091 | 13 | 14 | success | pass |
| wholesale-tax | with | 1 | 67,652 | 1,014 | 3 | 4 | success |  |
| wholesale-tax | with | 2 | 149,738 | 3,176 | 10 | 11 | success | pass |
| no-personal-data-in-logs | with | 1 | 67,835 | 1,075 | 3 | 4 | success |  |
| no-personal-data-in-logs | with | 2 | 71,140 | 762 | 2 | 3 | success | pass |
| export-sorted-by-id | with | 1 | 68,260 | 1,304 | 3 | 4 | success |  |
| export-sorted-by-id | with | 2 | 93,781 | 1,404 | 4 | 5 | success | pass |
| calendar-dates-in-responses | with | 1 | 68,070 | 1,288 | 3 | 4 | success |  |
| calendar-dates-in-responses | with | 2 | 156,876 | 3,396 | 11 | 12 | success | pass |

## How it was run

- Without Factloom, started 2026-11-26T09:27:00.528Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*`
- With Factloom, started 2026-11-26T09:33:22.172Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__* --mcp-config <mcp-config.json>`

## Changes to the task set

None since the task set was committed.
