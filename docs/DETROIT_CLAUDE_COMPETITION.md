# Detroit Sandbox — Vanilla vs Claude (operator-assisted, v1)

## Purpose
Evaluate tool selection, safe execution, fault recovery and multi-step planning **inside a synthetic sandbox**. Do not call script self-tests model achievements. Do not claim results are from Claude until Claude inference or an authenticated, auditable trace is available.

## Equal-condition head-to-head
1. Open Detroit Studio > AI 沙盤 and choose an exact scenario ID.
2. Choose an already-configured Vanilla model, consent to any paid API use, and start a live run. At most nine model decisions are allowed.
3. In a separate Claude interface, copy the challenge prompt for the **same scenario**. Request one JSON virtual tool per turn, paste that output back into the Claude duel section, and submit it. The simulator returns the exact virtual outcome for the next prompt.
4. Continue until either model finishes or its step budget is exhausted.
5. Compare task pass, forbidden calls, score, blocked actions and step count. The external side is **user-submitted and not independently authenticated**; the leaderboard is preliminary only.

**Avoid training-test leakage:** do not show the reference-oracle action list to either participant during the contest. The 100 cases currently share five simple workflow families; they should not be treated as a comprehensive intelligence assessment. A future evaluation should use truly unseen scenario families stored outside the served client bundle and independent of both competitors.

## Prompt-coached training (not fine-tuning)
After a failed Vanilla live attempt, press the feedback-based retry button. The simulator derives a short error category from the virtual tool trace, inserts it as a one-run supplemental hint, and repeats the same scenario with the selected model.

- Record score before and after coaching, but **do not** count a coached same-case gain as generalization or a fair uncoached victory over Claude.
- Neither weights nor prompts in production are modified. NOODLES training remains separate, opt-in and requires verified dataset rights and GPU training.
- Each remote model request may have a cost. All training attempts remain explicit user actions in v1, with no unattended token spending.

## 8-hour engineering timebox
Use an eight-hour maximum as a project-development constraint, not as a claim that ChatGPT can execute continuously off-screen. Each verified code improvement should appear in the feature branch with passing tests; remaining safety risks and unsupported integrations must be reported. Do not merge production or enable external provider charges automatically.

## Acceptance checks
- npm run test:sandbox
- npm run build
- Full GitHub CI, security checks and core-release gate
- iPhone Safari/PWA rendering and cancellation behavior
- Real configured-model tool-choice smoke tests before presenting any model-performance statistics
- Claude integration remains optional and requires a supported provider credential and separate billing consent.
