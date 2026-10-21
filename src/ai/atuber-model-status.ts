/** Atuber's independent checkpoint must exist before claiming trained identity. */
import modelManifest from "../../models/atuber/manifest.json";

export const ATUBER_MODEL_ID=modelManifest.model_id;
export const ATUBER_MODEL_BASE=modelManifest.base_model;
export const ATUBER_MODEL_RELEASE_STATE=modelManifest.release_state;
export const ATUBER_HAS_INDEPENDENT_WEIGHTS=
 modelManifest.release_state==="standalone-packaged"&&
 typeof modelManifest.standalone_weights==="string"&&
 modelManifest.standalone_weights.length>0;

export function atuberModelStageLabel():string{
 return ATUBER_HAS_INDEPENDENT_WEIGHTS?
  "阿土伯 · 獨立微調權重":
  "阿土伯 · Qwen3 0.6B 基底（尚未訓練）";
}
