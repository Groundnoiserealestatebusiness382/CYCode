---
name: watch-run
description: Monitor a running experiment, summarize metric trends, and flag divergence or completion.
---

Check on the experiment run(s) the user asks about (or all runs if unspecified).

1. Run `exp_status` without an id to list runs. Identify the run(s) of interest.
2. For each: `exp_status` with the id, a generous `tail_lines` (100+), and a
   `metric_regex` matching its metric lines (try patterns like
   `loss[=:]\\s*[0-9.eE+-]+`, `acc(uracy)?[=:]\\s*[0-9.]+`, or `step \\d+`).
3. Report concisely:
   - State: RUNNING or FINISHED (and exit evidence from the log tail).
   - Progress: latest step/epoch vs. expected total if visible.
   - Metric trend: improving, plateaued, or diverging — quote the last few values.
   - Anomalies: NaN/Inf losses, OOM, CUDA errors, exceptions, suspiciously frozen output.
4. If a run has clearly diverged (NaN loss, exploding values) say so plainly and
   suggest the likely first thing to check (learning rate, data, checkpoint resume).
   Only call `exp_stop` if the user asked you to stop bad runs.

Keep the report short: one block per run, lead with the verdict.
