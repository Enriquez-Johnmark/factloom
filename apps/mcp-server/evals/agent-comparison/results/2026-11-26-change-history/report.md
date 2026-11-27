# Token and tool-call comparison with and without Factloom

| | |
|---|---|
| Agent | Claude Code 2.1.332 (without); 2.1.332 (with) |
| Model | claude-sonnet-5-5 (without); claude-sonnet-5-5 (with) |
| Date | 2026-11-26 (without); 2026-11-26 (with) |
| Tasks | 10 in the set of change-history tasks of FL-081, 10 compared; each in two sessions per configuration |

## Result

A cost. With Factloom, the median task used 19.2% more tokens, input and output together, and 5.5 more tool calls; 8 of 10 checks passed with Factloom and 6 of 10 without it.

10 tasks show a direction, not a law: this is not a claim of statistical significance.

Every figure is from the agent's own usage output: tokens from `modelUsage` in each session's result event, tool calls from the `tool_use` blocks of its assistant events. Input tokens include those written to and read from the prompt cache. Nothing is estimated. A task's figures are the sum of its two sessions.

## Totals

| Figure | Without Factloom | With Factloom | Difference |
|---|---|---|---|
| Input tokens | 2,322,319 | 2,638,518 | +316,199 |
| of which read from the cache | 2,042,122 | 2,340,688 | +298,566 |
| Output tokens | 45,038 | 55,771 | +10,733 |
| Tool calls | 126 | 173 | +47 |
| Checks passed | 6 of 10 | 8 of 10 | +2 |

## Medians

| Figure | Median of the per-task differences, with minus without |
|---|---|
| Input tokens | +41,079 |
| Output tokens | +679.5 |
| Tool calls | +5.5 |
| Input and output tokens, as a share of the figure without | +19.2% |

## Per task

| Task | Input without | Input with | Output without | Output with | Tool calls without | Tool calls with | Check without | Check with | Token change |
|---|---|---|---|---|---|---|---|---|---|
| carrier-retry-limit | 185,798 | 244,222 | 2,872 | 4,325 | 8 | 17 | fail | pass | +31.7% |
| free-shipping-threshold | 223,099 | 293,971 | 4,387 | 6,446 | 12 | 18 | pass | pass | +32.1% |
| one-label-at-a-time | 163,567 | 271,566 | 3,040 | 5,547 | 7 | 19 | fail | pass | +66.3% |
| ascii-address-lines | 357,801 | 324,638 | 6,505 | 7,163 | 19 | 24 | pass | pass | -8.9% |
| tracking-number-formats | 252,307 | 249,395 | 4,380 | 4,701 | 15 | 14 | fail | fail | -1.0% |
| signature-threshold | 184,825 | 208,559 | 2,356 | 3,017 | 8 | 14 | fail | fail | +13.0% |
| rate-cache-lifetime | 217,834 | 216,297 | 3,960 | 3,961 | 13 | 14 | pass | pass | -0.7% |
| volumetric-divisor | 228,831 | 287,644 | 6,445 | 7,143 | 14 | 18 | pass | pass | +25.3% |
| tracking-batch-size | 213,011 | 321,322 | 3,131 | 5,112 | 12 | 18 | pass | pass | +51.0% |
| label-timeout | 295,246 | 220,904 | 7,962 | 8,356 | 18 | 17 | pass | pass | -24.4% |

## Tool calls by tool

| Tool | Without Factloom | With Factloom |
|---|---|---|
| `Bash` | 57 | 63 |
| `Edit` | 38 | 42 |
| `Read` | 28 | 33 |
| `Skill` | 3 | 2 |
| `ToolSearch` | 0 | 10 |
| `mcp__factloom__recall` | 0 | 20 |
| `mcp__factloom__record_fact` | 0 | 3 |

## Sessions

| Task | Configuration | Session | Input tokens | Output tokens | Tool calls | Turns | Result | Check |
|---|---|---|---|---|---|---|---|---|
| carrier-retry-limit | without | 1 | 91,665 | 1,113 | 5 | 6 | success |  |
| carrier-retry-limit | without | 2 | 94,133 | 1,759 | 3 | 5 | success | fail |
| free-shipping-threshold | without | 1 | 69,076 | 1,178 | 4 | 5 | success |  |
| free-shipping-threshold | without | 2 | 154,023 | 3,209 | 8 | 9 | success | pass |
| one-label-at-a-time | without | 1 | 67,672 | 927 | 3 | 4 | success |  |
| one-label-at-a-time | without | 2 | 95,895 | 2,113 | 4 | 6 | success | fail |
| ascii-address-lines | without | 1 | 171,831 | 3,432 | 10 | 11 | success |  |
| ascii-address-lines | without | 2 | 185,970 | 3,073 | 9 | 10 | success | pass |
| tracking-number-formats | without | 1 | 151,444 | 2,749 | 11 | 12 | success |  |
| tracking-number-formats | without | 2 | 100,863 | 1,631 | 4 | 5 | success | fail |
| signature-threshold | without | 1 | 90,246 | 720 | 4 | 5 | success |  |
| signature-threshold | without | 2 | 94,579 | 1,636 | 4 | 6 | success | fail |
| rate-cache-lifetime | without | 1 | 92,272 | 964 | 5 | 6 | success |  |
| rate-cache-lifetime | without | 2 | 125,562 | 2,996 | 8 | 9 | success | pass |
| volumetric-divisor | without | 1 | 68,404 | 1,007 | 4 | 5 | success |  |
| volumetric-divisor | without | 2 | 160,427 | 5,438 | 10 | 11 | success | pass |
| tracking-batch-size | without | 1 | 90,266 | 698 | 4 | 5 | success |  |
| tracking-batch-size | without | 2 | 122,745 | 2,433 | 8 | 9 | success | pass |
| label-timeout | without | 1 | 92,866 | 1,134 | 5 | 6 | success |  |
| label-timeout | without | 2 | 202,380 | 6,828 | 13 | 14 | success | pass |
| carrier-retry-limit | with | 1 | 90,582 | 1,255 | 5 | 6 | success |  |
| carrier-retry-limit | with | 2 | 153,640 | 3,070 | 12 | 13 | success | pass |
| free-shipping-threshold | with | 1 | 68,456 | 1,259 | 4 | 5 | success |  |
| free-shipping-threshold | with | 2 | 225,515 | 5,187 | 14 | 15 | success | pass |
| one-label-at-a-time | with | 1 | 145,304 | 2,939 | 9 | 10 | success |  |
| one-label-at-a-time | with | 2 | 126,262 | 2,608 | 10 | 11 | success | pass |
| ascii-address-lines | with | 1 | 117,678 | 2,141 | 8 | 9 | success |  |
| ascii-address-lines | with | 2 | 206,960 | 5,022 | 16 | 17 | success | pass |
| tracking-number-formats | with | 1 | 149,030 | 2,400 | 8 | 9 | success |  |
| tracking-number-formats | with | 2 | 100,365 | 2,301 | 6 | 8 | success | fail |
| signature-threshold | with | 1 | 116,447 | 1,201 | 9 | 10 | success |  |
| signature-threshold | with | 2 | 92,112 | 1,816 | 5 | 7 | success | fail |
| rate-cache-lifetime | with | 1 | 90,833 | 1,045 | 5 | 6 | success |  |
| rate-cache-lifetime | with | 2 | 125,464 | 2,916 | 9 | 10 | success | pass |
| volumetric-divisor | with | 1 | 92,173 | 1,238 | 6 | 7 | success |  |
| volumetric-divisor | with | 2 | 195,471 | 5,905 | 12 | 13 | success | pass |
| tracking-batch-size | with | 1 | 118,750 | 1,264 | 8 | 9 | success |  |
| tracking-batch-size | with | 2 | 202,572 | 3,848 | 10 | 11 | success | pass |
| label-timeout | with | 1 | 91,401 | 1,173 | 7 | 8 | success |  |
| label-timeout | with | 2 | 129,503 | 7,183 | 10 | 11 | success | pass |

## How it was run

- Without Factloom, started 2026-11-26T16:22:01.740Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__*`
- With Factloom, started 2026-11-26T16:34:13.050Z: `claude -p <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --permission-prompts none --strict-mcp-config --model claude-sonnet-5-5 --allowedTools Bash(node *),Bash(npm test *),Bash(npm run *),Bash(git *),mcp__factloom__* --settings {"autoMemoryEnabled":false,"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"ANTHROPIC_API_KEY= \"$FACTLOOM_COMPARISON_NODE\" \"$FACTLOOM_COMPARISON_SERVER_ENTRY\" hook recall"}]}]}} --mcp-config <mcp-config.json>`

## Changes to the task set

None since the task set was committed.
