# Vanilla Prose 4.1 — AI generated text UI/UX

This is a **rendering-only** refinement of standard AI answers. It does not alter model generation, prompt policy, Detroit tools, or save chat data.

## Reader experience

- Headings have clearer editorial hierarchy using the existing Bauhaus ink/red/blue palette; paragraphs and lists have more measured leading and rhythm.
- Blockquotes use a subtle surface and a red accent border. Inline code gets a quiet background, and horizontal rules organize long answers.
- Fenced Markdown code has an accurate language label when the model supplies one, a horizontally scrollable code surface, and a click-only **Copy** button. Copy shows success only after Clipboard API succeeds; failures show manual-copy guidance.
- GFM tables keep a semantic table, become a touch- and keyboard-scrollable section, and display a clear section header.
- Footnotes, lists, links, links' keyboard focus, responsive images, and print views are styled without modifying generated content.
- Font-mode settings (system, serif, sans, mono) are inherited, not forcibly replaced.
- The style only applies under `.message-row.from-ai .vanilla-prose`; user chat bubbles and independent apps remain unchanged.
- Works during token streaming without sending additional model requests.

## Security and quality

- Uses existing react-markdown and remark-gfm. No rehypeRaw, no dangerous inner HTML, no JavaScript evaluation, no dynamic CSS/HTML generated from model output.
- Outbound links use normal react-markdown URL sanitation with noreferrer/noopener. No new network services or dependencies.
- Clipboard writes require an explicit user click. The component does not persist source text.
- The existing Venus JSON block parser, artifact rendering, and source qualification are unchanged.
- Mobile, keyboard scroll, reduced motion, and print preferences are addressed.
- Validation: `npm run test:chat-ui`, `npm run build`, Vanilla CI and Quirinus security checks.

Manual QA: iPhone Safari/PWA in portrait and landscape; long Traditional Chinese medical note with h1-h4, lists, quotes, a 5-column table, and a fenced code block; dark/alternate font settings if available; slow streaming; code copy when permission fails; offline reading.
