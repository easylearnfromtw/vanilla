import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {formatIndexedPages,implicitResearchQuery} from "../src/search/search-evidence.ts";
const code=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("implicit research happens for current-world fact requests but not general/private reasoning",()=>{
 assert.match(implicitResearchQuery("現在最新的醫療法規公告內容有什麼變化？"),/最新/);
 assert.equal(implicitResearchQuery("解釋勾股定理的幾何意義"),null);
 assert.equal(implicitResearchQuery("不要上網，請告訴我最新醫療新聞"),null);
});
test("actual link index preserves clicked source URL and differentiates read/full from snippet-only",()=>{
 const data=formatIndexedPages([
  {title:"Official source",url:"https://example.org/report",kind:"full",excerpt:"Full article text."},
  {title:"Search only",url:"https://example.net/search-result",kind:"snippet",excerpt:"Only a snippet."}
 ]);
 assert.match(data,/\[1\] Official source/);
 assert.match(data,/https:\/\/example.org\/report/);
 assert.match(data,/已取得公開正文/);
 assert.match(data,/僅有搜尋結果摘要/);
 assert.doesNotMatch(data,/假設已驗證/);
});
test("real file readers and deterministic CREAM execute in chat without loaded model",()=>{
 const extractor=code("src/local-ai/document-extract.ts");
 assert.match(extractor,/pdfjs-dist\/build\/pdf\.mjs/);
 assert.match(extractor,/pdf\.getPage/);
 assert.match(extractor,/word\/document\.xml/);
 assert.match(extractor,/ppt\/slides\/slide/);
 assert.match(extractor,/read-excel-file\/browser/);
 assert.match(extractor,/parseCreamCSV\(text,name\)/);
 const chat=code("src/local-ai/LocalChat.tsx");
 assert.match(chat,/extractBrowserDocument\(file\)/);
 assert.match(chat,/analyzeCream\(dataset\)/);
 assert.match(chat,/listChatAttachments\(/);
 assert.match(chat,/inspectOwnRepository\(/);
 assert.match(chat,/implicitResearchQuery\(question\)/);
 assert.match(chat,/formatIndexedPages\(webIndex\)/);
});
test("personal learning is default for local model only; never automatically archive cloud model outputs",()=>{
 const core=code("src/noodles/teacher-core.ts");
 assert.match(core,/enabled:true,allowCrossModelHints:false,rightsConfirmed:true/);
 const store=code("src/noodles/teacher-store.ts");
 assert.match(store,/args\.provider!=="local"/);
 const ui=code("src/noodles/TeacherLearningPanel.tsx");
 assert.doesNotMatch(ui,/rightsConfirmed}\s+onChange/);
 assert.match(ui,/Gemini、DeepSeek 和 Ollama/);
});
test("safe project source read does not put GitHub tokens into static web bundle",()=>{
 const inspector=code("src/builder/repo-inspector.ts");
 assert.match(inspector,/api\.github\.com\/repos\/easylearnfromtw\/vanilla\/contents/);
 assert.match(inspector,/credentials:"omit"/);
 assert.match(inspector,/safeCodePath/);
 assert.doesNotMatch(inspector,/GITHUB_TOKEN|Authorization:"Bearer "/);
});
