# 自架後台相容介面

此變更準備原有衞國後端的自架相容性，不代表已遷移任何現有部署。

## Ceres 主機信任

可於伺服器私人環境設定 `WEIGUO_PUBLIC_BASE_URL` 為精確 HTTPS origin。設定後，Ceres webhook URL 必須等於此 origin 加 `/v1/ceres/telegram/webhook`；拒絕帳密、額外路徑、query、fragment、非預期端口和相似字尾主機。

沒有設定新變數時，保留既有合法 Railway webhook 行為。明確設定卻無效時會拒絕，不會退回任意主機。此設定不會建立 DNS、憑證、CORS 或 Telegram 可達性；也不自動覆蓋既有 webhook。

自架服務可設定 `WEIGUO_RUNTIME_KIND=self-hosted-server`，讓私有 Ceres 診斷回報真實選定的 runtime 標籤。這只是伺服器設定，不是健康度或模型驗證。未設定時保留舊回應相容性。

## 選用本機 PDF worker

`WEIGUO_PDFCRAFT_LOCAL_WORKER_ENABLED=true` 選擇固定內部 worker `http://pdf-broker:9090`，沿用 `WEIGUO_PDFCRAFT_WORKER_SECRET` 和既有 HMAC wire contract。需要明確部署並完成 runtime probe 的私人 broker；公開 PWA 不取得 Docker 管理權或 worker key。

內部 HTTP 不是加密通道，只能放在本人主機的私人容器網路。此 adapter 不讀取請求者提供的網址，不使用環境 proxy、不跟隨 redirect；既有 `remote_origin()` 的 public HTTPS 邊界維持不變。

本機與遠端旗標同時啟用、簽章設定不全、readiness 格式錯誤或 worker 不可用時，拒絕 PDF 工作，不降級至未隔離本機執行或另一個雲端服務。

所有身分驗證、家庭 ACL、私密模式與逐次 PDF 傳送同意仍由原有 gateway 檢查。單元測試使用假 worker；實際 Windows、容器隔離、PDF CLI 及 iPhone 流程仍需另行驗收。
