import {Children,isValidElement,useState,type ReactNode} from "react";
import {Check,Copy,AlertCircle} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import VenusBlocks from "../venus/VenusBlocks";
import BookCitationCards,{parseBookCitationPayload} from "./BookCitationCards";
import PaperCitationCards,{parsePaperRefs} from "./PaperCitationCards";
import {parseVenusMessage} from "../venus/presentation";

/** Native safe Markdown. No raw HTML plugin, injected markup, or external code highlighter. */
function collectText(node:ReactNode):string{
 if(typeof node==="string"||typeof node==="number")return String(node);
 if(Array.isArray(node))return node.map(collectText).join("");
 if(isValidElement<{children?:ReactNode}>(node))return collectText(node.props.children);
 return "";
}
function CodePanel({children}:{children?:ReactNode}){
 const [copyState,setCopyState]=useState<"idle"|"ok"|"failed">("idle");
 const codeNode=Children.toArray(children).find(node=>isValidElement(node));
 const token=isValidElement<{className?:string}>(codeNode)?codeNode.props.className||"":"";
 const language=token.match(/(?:^|\s)language-([a-z0-9_+#.-]{1,24})(?:\s|$)/i)?.[1]||"";
 const code=collectText(children).replace(/\n$/,"");
 const copy=async()=>{
  setCopyState("idle");
  try{
   if(!navigator.clipboard?.writeText)throw Error("Clipboard not available");
   await navigator.clipboard.writeText(code);
   setCopyState("ok");
  }catch{setCopyState("failed");}
 };
 return <div className="markdown-code-shell">
  <div className="markdown-code-toolbar">
   <span className="markdown-code-language">{language||"程式碼"}</span>
   <button type="button" className="markdown-code-copy" onClick={()=>{void copy();}} aria-label="複製這段程式碼" title="複製這段程式碼">
    {copyState==="ok"?<Check size={14} aria-hidden="true"/>:copyState==="failed"?<AlertCircle size={14} aria-hidden="true"/>:<Copy size={14} aria-hidden="true"/>}
    <span>{copyState==="ok"?"已複製":copyState==="failed"?"複製失敗":"複製"}</span>
   </button>
  </div>
  <pre tabIndex={0}>{children}</pre>
  {copyState==="failed"&&<p className="markdown-code-feedback" role="status">剪貼簿不可用，請長按程式碼選取複製。</p>}
  {copyState==="ok"&&<span className="markdown-sr-only" role="status">程式碼已複製到剪貼簿</span>}
 </div>;
}
function BookRefsPanel({children}:{children?:ReactNode}){
 const codeNode=Children.toArray(children).find(node=>isValidElement(node));
 const classes=isValidElement<{className?:string}>(codeNode)?codeNode.props.className||"":"";
 const raw=collectText(children).trim();
 if(/(?:^|\s)language-paperrefs(?:\s|$)/.test(classes)){
  const papers=parsePaperRefs(raw);
  if(papers)return <PaperCitationCards papers={papers}/>;
 }
 if(/(?:^|\s)language-bookrefs(?:\s|$)/.test(classes)){
  const records=parseBookCitationPayload(raw);
  if(records)return <BookCitationCards books={records}/>;
 }
 return <CodePanel>{children}</CodePanel>;
}
function MarkdownTable({children}:{children?:ReactNode}){
 return <div className="markdown-table-shell">
  <div className="markdown-table-topline"><span>資料表</span><small>橫向捲動可查看完整內容</small></div>
  <div className="markdown-table-scroll" role="region" aria-label="回答中的資料表，可左右捲動" tabIndex={0}><table>{children}</table></div>
 </div>;
}
/** Model-generated strings are rendered as safe React elements, not injected HTML.
 * - Preserves plain Markdown, table semantics and Venus protocol.
 * - External links use react-markdown's URL sanitization and noreferrer.
 * - Copy actions only access clipboard on an explicit click.
 */
export default function ChatMarkdown({source}:{source:string}){
 const view=parseVenusMessage(source);
 return <div className="vanilla-markdown vanilla-prose">
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
   a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
   table:({children})=><MarkdownTable>{children}</MarkdownTable>,
   pre:({children})=><BookRefsPanel>{children}</BookRefsPanel>
  }}>{view.text||"正在生成回答…"}</ReactMarkdown>
  {view.blocks.length>0&&<VenusBlocks blocks={view.blocks}/>}
 </div>;
}
