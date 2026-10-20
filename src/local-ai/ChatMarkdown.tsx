import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import VenusBlocks from "../venus/VenusBlocks";
import {parseVenusMessage} from "../venus/presentation";

/** Safe Markdown renderer for model-generated text.
 * - No raw HTML plugin or unsafe HTML injection.
 * - Links use react-markdown's default URL sanitization and open in new tab.
 * - Never renders table raw source when a native Sheets card is already present.
 */
export default function ChatMarkdown({source}:{source:string}){
 const view=parseVenusMessage(source);
 return <div className="vanilla-markdown">
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
   a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
   table:({children})=><div className="markdown-table-scroll"><table>{children}</table></div>
  }}>{view.text||"正在生成回答…"}</ReactMarkdown>
  {view.blocks.length>0&&<VenusBlocks blocks={view.blocks}/>}
 </div>;
}
