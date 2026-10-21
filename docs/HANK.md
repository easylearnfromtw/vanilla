# Hank — Vanilla AI 品質測試

**Hank** 是 Vanilla AI 的自動化測試名稱，底層由 [Giskard v3](https://github.com/Giskard-AI/giskard-oss) 驅動。

- **重大 AI 程式變更**：自動執行 Giskard 行為迴歸檢查。
- **小幅修改**：預設只做既有 CI，不自動啟動較昂貴的 Hank 測試；可在 PR 加 `ai-major` 或透過 Actions 手動執行。
- **實際模型漏洞掃描**：需擁有者另外設定推論服務與測試金鑰，不能以迴歸測試通過取代。

進入 GitHub **Actions → Hank AI Quality Gate** 查看執行紀錄。測試報告顯示 `system: Hank`，且明確標示使用的 Giskard 引擎。

完整操作說明：[Hank / Giskard 測試政策](./GISKARD_MAJOR_AI_TESTS.md)。
