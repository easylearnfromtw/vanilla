# Project evidence grounding for CITYMUS and 欣緯

## Failure reproduced

A prompt such as `CITMUS隨即選一首歌` previously went to the generic text model. Qwen2.5 0.5B could echo an invented song title and make it appear an action had completed. The PROJECT HUB automatic context gate also omitted the `CITMUS` typo and Chinese `欣緯` aliases, so no saved project evidence was passed to the model.

## Phase 1: fail closed, do not fake integration

- `src/projects/project-evidence.ts` resolves the brand to actual *repository identities*, separating `citymusic`, `signwellbio`, `signwelltec`, and `Signwellsoft`.
- Retrieval in `src/projects/project-store.ts` is restricted to the repositories explicitly named by the user. Mentioning only `欣緯` permits the three divisions, without assuming which is intended.
- Questions about existing brand content require real indexed PROJECT HUB evidence or an actual document/web source; otherwise Vanilla explains that the information is unavailable. Creative requests are not blocked.
- Project-specific context receives higher prompt-budget priority, but this **does not extend** the context window or make a small model accurate on its own.
- CITYMUS random-selection and playback requests without a real verified adapter are **not** delegated to the model. The chat states the missing functionality, rather than claiming selection or playback.
- Private mode is preserved: it never loads public repositories or Drive memories automatically. Disabling the project-context preference is also respected.

## Existing data sources (not automatically synchronized)

1. In Vanilla, open **PROJECT HUB** and select **取得我的 GitHub 專案**.
2. Choose the relevant repository; select its source files and click **讀取選取原始碼並建立知識索引**. Alternatively use **索引全部公開專案**, keeping in mind GitHub rate limits and the per-browser IndexedDB index.
3. In the chat **模型與工具** panel, leave **專案程式碼** enabled; refresh the project index after changes.
4. With a reliable model available, ask for an existing feature and verify that the response cites `[P1]` etc. These cite the saved excerpt, **not** the current deployed runtime or a full database.
5. For actual song playback or random selection, implement a CITYMUS adapter backed by an authorized song catalog and a verified action result. Indexing source files does **not** enable playback or grant execution permissions.

## Phase 2 still required

Implement explicit per-project adapters / signed APIs, with access control, versioned data (articles, track catalog, site state), signed account ownership, freshness timestamps, query-time retrieval, tool result provenance and post-execution confirmation. Keep authorization and write/execute consent separate from passive Q&A. Cross-device data synchronization and live actions are **not** delivered in Phase 1.
