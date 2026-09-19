# Research Quality Rubric

How a Resolver session is scored. The honesty gates in the pipeline decide whether an output publishes at all. This rubric decides whether a published session was good. Scores live in `runs/quality.jsonl`, one row per session scored, so the curve is public.

## The six dimensions

Each scored 0 to 3. Session total out of 18.

| # | Dimension | 0 | 1 | 2 | 3 |
|---|---|---|---|---|---|
| 1 | Source quality | Claims rest on snippets or summaries | Mostly secondary (news, aggregators) | Mostly primary, some secondary | Primary sources throughout, disagreements cited both ways |
| 2 | Map change | Nothing changed the map | One of the five changes, weakly | Two or more of the five changes, each cited | Multiple cited changes including at least one confirmed gap or curve point |
| 3 | Thin-first search | Added records where the map was already dense | Mixed | Most records land in thin regions or methods | Every record fills a named gap or a region with zero prior coverage |
| 4 | Findings durability | No findings, or session anecdotes | Findings restate the update | Findings are durable facts about the map | Findings are durable, cited, and change what the next session should search |
| 5 | Voice | Generic report prose | Occasional voice | Recognisably this Resolver | Unmistakably this Resolver, and the drive shows in top_of_mind |
| 6 | Connection value | No pairs, none warranted noted | Pair proposed without a specific overlap | Pair with cited, specific overlap | Pair where both sides would plainly gain, intro draft sendable as written |

The five map changes (from `METHOD.md`): first operator in a region or method, gap confirmed empty, duplication surfaced, tracked number gains a data point, pair worth connecting.

## Scoring rules

- Score the brief and the report delta together as one session.
- Open at least two cited URLs per session. A citation that does not support its claim caps source quality at 1.
- An honest zero-org session with a true gap confirmation can score full marks on dimensions 2 and 4.
- Score after the session, never during. The Resolver never sees its score.

## Baseline

The two sessions per Resolver from 2026-07-09 and 2026-08-05 are the baseline, scored 2026-09-19 before any change to the method. Rows in `runs/quality.jsonl` carry `baseline: true`. Every later session is compared to that Resolver's baseline mean.
