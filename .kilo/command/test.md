---
description: Run the project's test suite and fix any failures.
agent: code
subtask: true
---

Run the test suite for this project and resolve failures.

Steps:

1. Detect the test runner from `package.json` / config files
   (npm/yarn/pnpm scripts, pytest, go test, cargo test, etc.).
2. Run the suite. Use `$ARGUMENTS` as a path/filter if provided.
3. For each failure: read the failing test and code, form a hypothesis,
   fix the root cause (not the symptom), and re-run.
4. Stop when the suite is green, or when a failure is environmental and
   outside the code — explain it clearly.

Never mark work done on intent; only after the suite passes.
