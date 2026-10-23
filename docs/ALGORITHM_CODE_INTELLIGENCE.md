# Algorithm-aware Code Intelligence

Inspired by the **teaching approach** of labuladong/fucking-algorithm, not a copy of its articles or source code.

## Objective
Extend the existing code-analysis snapshot module with an explainable algorithm analysis layer. Answer not only what a piece of code does, but why it works, when the pattern applies, and what tradeoffs exist.

## Output contract
- Pattern classification: sliding window, two pointers, binary search, DFS/BFS, backtracking, dynamic programming, greedy, divide and conquer, graph algorithms, or unknown.
- Preconditions and invariants with cited code ranges.
- Time and space complexity, with assumptions and uncertainty explicitly stated.
- Step-by-step walkthrough using a bounded, user-provided test input.
- Optional visualization trace (events: enter, compare, update, enqueue, dequeue, recurse, return), strictly capped for memory safety.
- Counterexamples, edge cases and test suggestions.
- Alternative implementation with tradeoff explanation; no automatic code writes.
- Cross-revision comparison through the existing AnalysisSnapshot interface.

## Quality requirements
- No algorithm classification without code evidence.
- Avoid claiming a greedy approach is correct without an exchange argument or other proof.
- For dynamic programming, explain state, recurrence, initialization and traversal order.
- For recursion, identify base case, progress measure and termination.
- Distinguish static complexity estimates from measured performance.
- Use sandboxed execution for dynamic traces; never run untrusted code in the main app.
- Keep source code and snapshots private according to the existing local-only/remote consent policy.
- Attribute links to third-party learning materials rather than copying their text.

## UI
Use an Apple-HIG-inspired split-view: source code on left, explanation and visual trace on right, with timeline tabs for historical comparisons. Accessible keyboard navigation and reduced-motion fallback are required.

## Integration status
This document is a roadmap. Algorithm tracing, UI, IDE extension and persistent monitoring are **not implemented** by this change.
