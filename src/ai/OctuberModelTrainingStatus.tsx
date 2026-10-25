import sumptuous from "../../models/octuber-sumptuous/manifest.json";
import sixty from "../../models/octuber-60b/manifest.json";
import OctuberVirtualHostPanel from "./OctuberVirtualHostPanel";

/** Show actual weight-development state, never treat an Ollama base tag as a trained OCTUBER model. */
export default function OctuberModelTrainingStatus(){
 return <section className="model-connection-panel" aria-label="OCTUBER 30B 與 60B 模型訓練狀態">
  <h3>OCTUBER · 30B／60B 模型研發沙盤</h3>
  <p>以下的 30B、60B 是<strong>真正的神經網路總參數等級</strong>，不是運算主機規格或模型別名。沙盤演練與真實訓練權重分開記錄；網站不會在手機或電腦瀏覽器偷偷購買 GPU。</p>
  <div className="octuber-api-steps">
   <div><span>30B</span><strong>SUMPTUOUS · 30.5B</strong><small>{sumptuous.training_completed?"已有訓練紀錄，仍需獨立驗證":"未完成專屬權重微調"}</small></div>
   <div><span>60B</span><strong>OCTUBER · 約 59B</strong><small>{sixty.training_completed?"已有訓練紀錄，仍需獨立驗證":"尚未訓練；MXFP4 相容性待驗證"}</small></div>
  </div>
  <p><strong>30B 基底：</strong>{sumptuous.base_model}（MoE）。<strong>60B 基底：</strong>{sixty.base_model}（MoE／MXFP4）。目前 GitHub 沙盤只會估算模型容量和驗證微型網路訓練流程；尚無新訓練的 30B／60B 權重可下載。</p>
  <p><a href="https://github.com/easylearnfromtw/vanilla/blob/main/training/octuber-gpu-sandbox/README.md" target="_blank" rel="noreferrer">查看電腦 GPU 沙盤操作指南</a> · <a href="https://github.com/easylearnfromtw/vanilla/blob/main/training/octuber-sumptuous/README.md" target="_blank" rel="noreferrer">30B 真實 QLoRA 訓練關卡</a></p>
  <OctuberVirtualHostPanel/>
  <small>GPU 煙霧測試必須在有 CUDA 的電腦上實際執行；純容量沙盤不代表 CUDA 運行成功。60B 的專屬訓練器尚未完成實機驗證，兩種模型均不應誤標成已訓練完成。</small>
 </section>;
}
