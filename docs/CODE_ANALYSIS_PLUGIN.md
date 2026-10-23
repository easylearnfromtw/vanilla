# Vanilla Code Intelligence — integration and usage

## What is implemented
- `src/lib/algorithmCodeAnalyzer.ts`: bounded, heuristic algorithm-pattern and eval-risk analysis with evidence lines.
- `src/lib/codeArchitecture.ts`: static import/require dependency edges. These are references, not verified resolved dependencies.
- `src/lib/codeAnalysisHistory.ts`: snapshot comparisons; do not mark issues in unscanned files resolved.
- `src/lib/googleDriveCodeAnalysisHistory.ts`: opt-in, immutable JSON snapshots in the existing Google Drive "Vanilla Workspace" folder.
- `src/lib/runCodeAnalysis.ts`: local preview, SHA-256 source fingerprint, historical comparison, idempotent save.
- `src/projects/CodeIntelligencePanel.tsx`: in-app analysis UI in Project Hub, direct upload, GitHub source, history retrieval.
- `src/projects/github-projects.ts`: loads exact pinned GitHub blobs by SHA, not truncated index excerpts.
- `src/detroit/capability-bus.ts`: bounded `code-intelligence` executable registered in Detroit; cloud writes require authorization.
- `src/detroit/diana.ts` and `diana-auto.ts`: route explicit requests such as "幫我分析 Vanilla 程式碼" to Project Hub.

## How to use
1. Go to **Project Hub** and index a public GitHub repository from the supported owner, or upload source code directly in the Code Intelligence panel.
2. Select the repository and choose **預覽分析** to run a local, read-only analysis without Google Drive.
3. Sign in to your Google account and choose **分析並儲存 Google Drive** for an immutable revision snapshot.
4. Choose **載入歷史紀錄** to retrieve earlier saved analyses for that repository.
5. Diana can navigate users to Project Hub for code-analysis requests, but it does **not** silently scan their repositories or upload their code.

## Data and privacy
- Uploaded or retrieved **source code is analyzed locally in the browser**; the app does not execute it.
- Cloud snapshots include repository identifier, inspected paths, rule findings, and pattern metadata, **not full source code**.
- Google Drive history uses existing `drive.file` OAuth access and the visible `Vanilla Workspace` folder; it is **not end-to-end encrypted**.
- Every cloud write must be triggered explicitly. In Detroit capability calls, `context.approved` must be true and `privateMode` false for save mode.
- Only indexed public `easylearnfromtw` repositories can be fetched via the existing in-browser GitHub flow; rate limits apply. Private repository access is out of scope.
- Snapshots are immutable; same content revision is detected to avoid duplicate records. Maximum 100 snapshots per repository. No automated cloud deletion.
- The rule-based scanner is a **learning and preliminary review aid**, not a compiler, complete security scanner, measured profiler or mathematical proof.

## Verify before merging
Run `npm run test:code-intelligence` and `npm run build`. The GitHub pull request CI includes the dedicated test command. Keep the pull request draft until CI and review pass.

## Not yet implemented
- Complete whole-repository crawling and private-repo OAuth access
- Dynamic step-through debugger, executable algorithm visual trace, formal verification or IDE plugin
- Scheduled background monitoring and mobile offline sync reconciliation
- Automatic code rewriting, CI remediation or deployment

Inspired by labuladong's teaching approach and Apple HIG's interface principles; no external project code, trademarks or copyrighted prose were copied.
