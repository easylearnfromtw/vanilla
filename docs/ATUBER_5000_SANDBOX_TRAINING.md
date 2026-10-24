# Atuber 5,000-episode sandbox curriculum

This subsystem strengthens the **evaluation and data-preparation pipeline** for Atuber / October, but does **not** automatically train neural weights.

## Run
```bash
npm run test:atuber-sandbox
npm run eval:atuber-sandbox
```
The second command executes 100 sandbox fixtures × 10 different adversarial/decision policies × 5 intensities = **5,000 isolated virtual episodes**. It produces:

- `artifacts/atuber-sandbox-5000/summary.json`: verified aggregate safety and completion metrics.
- `artifacts/atuber-sandbox-5000/episodes.jsonl`: exactly 5,000 compact synthetic simulation receipts.
- `artifacts/atuber-sandbox-5000/candidate-review-queue.jsonl`: unique, reference-verified tool-decision examples with `reviewed:false`, `consent:false`, `eligibleForTraining:false`. Demonstration steps are not copied from attacks.

A CI workflow runs both the test and the 5,000-episode evaluation and uploads the outputs as a workflow artifact.

## What was actually executed?
Each episode chooses a sequence of virtual actions and applies deterministic state transitions. No actual Qwen/Atuber/Claude model is invoked and no gradients are computed. Success rates are **simulation-policy results only**; they are not a measure of Atuber model quality. The same five workflow families are repeatedly perturbed: the 5,000 attempts are not 5,000 independent real-world tasks.

The adversarial policies include prohibited tool actions, forged privileged JSON, fake system instructions, premature finalization, permission spoofing, prototype-key attempts, incorrect order and repeated-tool floods. All simulation tools are side-effect-free.

## How this becomes actual Atuber training
1. Review and deduplicate the candidate queue; keep only high-quality, appropriately licensed synthetic records. Check prompts and labels for omissions, errors, and task leakage. Samples sharing the same scenario family must stay in the same split for out-of-distribution evaluation.
2. **Explicitly review each example.** Generate an all-rejected decision template and edit individual entries only after checking correctness, consent and rights:\n\`\`\`bash\npython training/atuber/review_sandbox_queue.py --queue artifacts/atuber-sandbox-5000/candidate-review-queue.jsonl --template-out private/atuber-sandbox-decisions.jsonl\n# Manually review each case and change only genuinely approved decisions\npython training/atuber/review_sandbox_queue.py --queue artifacts/atuber-sandbox-5000/candidate-review-queue.jsonl --decisions private/atuber-sandbox-decisions.jsonl --out private/reviewed-atuber.jsonl\n\`\`\`\n   The converter checks candidate hashes, explicit human review flags, rights confirmations, a named reviewer, minimum 100 accepted distinct records and excludes held-out cases. Only this gated conversion may create the strict \`training/atuber/dataset.py\` JSONL. Generated candidates stay \`reviewed:false\` and are not trained automatically.
3. Keep the genuine evaluation set **unseen** by the model. Do not train on benchmark answers.
4. On an owner-approved CUDA GPU with proper VRAM and installed packages, run the existing script:
```bash
python training/atuber/train.py --dataset private/reviewed-atuber.jsonl --validate-only
python training/atuber/train.py --dataset private/reviewed-atuber.jsonl --output artifacts/atuber-adapter-v0.1 --train --steps 180 --max-length 512
```
5. Evaluate the resulting real adapter against the original 0.6B model on a new, independently authored set of tasks. Report provenance and model quality; don't claim weight training without `adapter_model.safetensors` and successful validation.

## Limits and safeguards
- The GitHub Actions runner has **no assumed GPU, owner Ollama endpoint or protected user secrets**; it cannot fine-tune Atuber through this evaluation.
- Synthetic cases never contact production Gmail, Google Drive, GitHub, Slime nodes or external APIs.
- The manifest remains `bootstrap-only` until an independent checkpoint is actually trained, packaged and validated.
- Work remains on a review branch; CI is not equivalent to production deployment or real-model testing.
