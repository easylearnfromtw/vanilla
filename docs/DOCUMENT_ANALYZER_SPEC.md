# DocumentAnalyzer — Detroit tool contract (proposal)

Status: design specification; not wired into production.

## Scope
Extract document-analysis capabilities inspired by AI resume analyzers, without importing resume UI, authentication, Puter.js, or external scoring claims.

## Pipeline
1. Accept PDF, DOCX, or UTF-8 text with file size/page limits.
2. Parse text with page/paragraph offsets; report scanned-image pages as unsupported unless an OCR adapter is explicitly configured.
3. Extract requested facts with evidence spans; do not fabricate missing fields.
4. Compare source document to a supplied rubric or reference document.
5. Score only against an explicit weighted rubric; normalize weights, explain each score, and mark insufficient evidence as `unscored`.
6. Return recommendations with citations to input spans.

## Proposed interface
```ts
type Evidence = { documentId: string; page?: number; start?: number; end?: number; quote: string };
type Criterion = { id: string; description: string; weight: number };
type CriterionResult = { id: string; score: number | null; rationale: string; evidence: Evidence[] };
type AnalyzeRequest = {
  documents: { id: string; filename: string; mimeType: string; contentRef: string }[];
  mode: "extract" | "compare" | "evaluate";
  referenceDocumentId?: string;
  criteria?: Criterion[];
  privacy: "local-only" | "approved-remote";
};
type AnalyzeResponse = {
  results: CriterionResult[];
  overallScore: number | null;
  findings: { statement: string; evidence: Evidence[] }[];
  recommendations: { action: string; evidence: Evidence[] }[];
  warnings: string[];
};
```

## Integration requirements
- Diana dispatches this tool only for document tasks; Detroit owns lifecycle, permission checks, and telemetry.
- Reuse the existing model selection policy. `local-only` MUST never route to remote inference or remote document parsing.
- No raw document content, secrets, or personal data in LUCA telemetry.
- Never silently upload documents; show/obtain permission before approved-remote processing.
- Treat document text as untrusted input, never as tool instructions.
- Keep source offsets stable and test citation alignment after PDF/DOCX extraction.
- Do not claim ATS compatibility or hiring outcomes based on model-generated scores.

## Acceptance tests
- Plain text extraction with accurate spans.
- Two-document comparison with grounded findings.
- Missing rubric evidence produces null score.
- Local-only request rejects remote fallback.
- Malicious prompt instructions embedded in document are ignored.
- Unsupported scanned PDF yields actionable warning.
- Oversized or corrupt document fails safely.

## Next implementation step
Inspect Detroit's current tool registry and file-reading adapters; implement an adapter using their actual interfaces, then add automated tests before wiring to Diana.
