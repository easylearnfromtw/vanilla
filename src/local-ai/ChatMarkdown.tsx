import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Safe Markdown renderer for model-generated text.
 * - No raw HTML plugin or unsafe HTML injection.
 * - Links use react-markdown's default URL sanitization and open in new tab.
 * - Never renders table raw source when a native Sheets card is already present.
 */
export default function ChatMarkdown({source}:{source:string}){
 return <div className="vanilla-markdown">
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
   a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
   table:({children})=><div className="markdown-table-scroll"><table>{children}</table></div>
  }}>{source||"正在生成回答…"}</ReactMarkdown>
 </div>;
}
