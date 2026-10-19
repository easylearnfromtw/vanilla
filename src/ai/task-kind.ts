/** Task classification shared by routing, prompts and sampling. Pure; no browser APIs. */
export type TaskKind="casual"|"code"|"analysis"|"writing"|"vision"|"general";
export function classifyTask(question:string,image=false):TaskKind{
 if(image)return "vision";
 const q=question.slice(0,1500);
 if(/程式|程式碼|debug|bug|github|typescript|javascript|python|除錯|修復|編譯|\bAPI\b|regex|```|\bfunction\b|\bconst\b|SQL|CSS|HTML/i.test(q))return "code";
 if(/分析|比較|研究|論文|醫學|證據|為什麼|推理|數據|計算|評估|規劃|策略|利弊|優缺點|怎麼選|試算|統計/.test(q))return "analysis";
 if(/寫作|改寫|草稿|文案|電子郵件|email|信件|文章|報告|故事|摘要|翻譯|潤飾|潤稿|貼文|邀請函|祝福|致詞|講稿/i.test(q))return "writing";
 if(/^(你好|哈囉|嗨|hi|hello|謝謝|感謝|早安|午安|晚安|在嗎|好的|收到|讚)[!！。？?\s~～]*$/i.test(q.trim()))return "casual";
 return "general";
}
