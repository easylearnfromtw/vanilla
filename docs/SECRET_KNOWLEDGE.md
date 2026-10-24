# Detroit Secret Knowledge
Original inspiration: https://github.com/trimstray/the-book-of-secret-knowledge
MIT license and credit: https://github.com/trimstray/the-book-of-secret-knowledge/blob/master/LICENSE.md
Copyright (c) 2017 trimstray.

This is an independently authored, curated offline list of 13 engineering references; it does not mirror the upstream README, run scripts, scan hosts or fetch external pages. Third-party manuals have their own licenses.

The src/assistant/technical-knowledge.ts index is surfaced by src/assistant/tool-knowledge.ts and reused as short technical grounding for ordinary model chats. Search is local and read-only; references are not current-web verification. SSH, Docker, Git, database and infrastructure changes require approval and rollback planning.

Tests: node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/technical-knowledge.test.mjs
