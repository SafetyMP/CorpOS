---
description: Decompose a feature goal into parallelizable worktree task specs.
agent: spec
subtask: true
---

Decompose the following goal into independent, parallelizable task specs
for Agent Manager fan-out.

GOAL:
$ARGUMENTS

Run the decomposition process:

1. Investigate the codebase (modules, types, shared contracts, tests).
2. Identify any shared files/interfaces that would collide across parallel
   tasks. Either merge colliding work into one task or extract a phase-0
   prerequisite that lands on the base branch first.
3. Emit a fenced JSON array of task specs with `id`, `phase` (0 = base
   prerequisite, 1 = parallel fan-out), `name` (<= 24 chars), `branch`
   (hyphenated seed), `summary`, and a fully self-contained `prompt`
   (file anchors + chosen approach + verification command(s)).
4. Follow the JSON block with a short **Conflict map**.

The output of this command is the input to `/build`.
