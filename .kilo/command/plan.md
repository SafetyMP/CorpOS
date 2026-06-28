---
description: Produce a structured implementation plan for a feature or change.
agent: plan
subtask: true
---

Produce an implementation plan for: $ARGUMENTS

Steps:

1. Search the codebase for the relevant modules, types, entry points, and
   any prior art for similar features.
2. Choose the simplest approach consistent with existing patterns.
3. Output: Goal, Approach, Files (with `file:line` anchors), numbered Steps
   each with its own verification, and Risks.

Do not write production code — plan only.
