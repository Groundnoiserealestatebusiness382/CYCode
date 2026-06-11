---
name: repro-check
description: Audit a research codebase for reproducibility gaps (seeds, deps, configs, data provenance).
---

Audit this project's reproducibility. Investigate with read-only tools (use `explore`
for broad sweeps), then report. Check:

1. **Environment** — is there a pinned dependency spec (requirements.txt with versions,
   environment.yml, lockfile)? Does the README state Python/CUDA versions?
2. **Randomness** — grep for seed handling (`seed`, `torch.manual_seed`, `np.random`).
   Are all sources seeded (python, numpy, torch, CUDA, dataloader workers)? Is the
   seed configurable and logged?
3. **Configuration** — are hyperparameters in config files/CLI args, or hardcoded?
   Are the configs for reported results actually present in the repo?
4. **Data provenance** — is it clear how to obtain each dataset and which
   version/split/preprocessing was used?
5. **Run commands** — does the README/script show the exact commands to reproduce
   the main results? Do referenced scripts and paths actually exist?
6. **Outputs** — are checkpoints/metrics/logs written somewhere stable and named by
   run? Is there any run-tracking (wandb, tensorboard, csv logs)?

Report as a checklist with ✅ / ⚠️ / ❌ per item, citing file paths as evidence,
followed by the 3 highest-impact fixes. Only make changes if the user asks.
