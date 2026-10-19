/** Structured Markdown table extraction for the visual chat renderer.
 * Table source remains in history for export, but is shown visually only once.
 */
export function parseTable(source:string):string[][]|null{
 const lines=source.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const start=lines.findIndex(x=>x.startsWith("|")&&x.endsWith("|"));
 if(start<0||start+2>=lines.length)return null;
 const cells=(s:string)=>s.replace(/^\||\|$/g,"").split("|").map(x=>x.trim());
 if(!/^\|?[\s:|-]+\|?$/.test(lines[start+1])||!lines[start+1].includes("---"))return null;
 const header=cells(lines[start]);const body:string[][]=[];
 for(let i=start+2;i<lines.length&&lines[i].startsWith("|");i++)body.push(cells(lines[i]));
 return body.length?[header,...body]:null;
}
export function stripRenderedTable(source:string):string{
 if(!parseTable(source))return source;
 const lines=source.split(/\r?\n/);
 const start=lines.findIndex((line,i)=>line.trim().startsWith("|")&&line.trim().endsWith("|")&&i+1<lines.length&&
  /^\|?[\s:|-]+\|?$/.test(lines[i+1].trim())&&lines[i+1].includes("---"));
 if(start<0)return source;
 let end=start+2;
 while(end<lines.length&&lines[end].trim().startsWith("|"))end++;
 return [...lines.slice(0,start),...lines.slice(end)].join("\n").replace(/\n{3,}/g,"\n\n").trim();
}
