/** Small offline LaTeX -> MathML AST for common maths, never HTML or code evaluation.
 * Unsupported macros fail closed and preserve literal LaTeX instead of misrendering.
 */
export type MathNode=
 |{kind:"row";items:MathNode[]}
 |{kind:"token";text:string;role:"mi"|"mn"|"mo"}
 |{kind:"fraction";numerator:MathNode;denominator:MathNode}
 |{kind:"sqrt";content:MathNode}
 |{kind:"script";base:MathNode;sup?:MathNode;sub?:MathNode};

const COMMANDS:Record<string,string>={
 alpha:"α",beta:"β",gamma:"γ",delta:"δ",epsilon:"ε",theta:"θ",lambda:"λ",mu:"μ",pi:"π",rho:"ρ",sigma:"σ",phi:"φ",omega:"ω",
 Gamma:"Γ",Delta:"Δ",Theta:"Θ",Lambda:"Λ",Pi:"Π",Sigma:"Σ",Phi:"Φ",Omega:"Ω",infty:"∞",partial:"∂",
 times:"×",cdot:"·",pm:"±",mp:"∓",leq:"≤",geq:"≥",neq:"≠",approx:"≈",to:"→",rightarrow:"→",leftarrow:"←",
 sum:"∑",prod:"∏",int:"∫",forall:"∀",exists:"∃",in:"∈",notin:"∉",subset:"⊂",subseteq:"⊆",cup:"∪",cap:"∩",
 sin:"sin",cos:"cos",tan:"tan",log:"log",ln:"ln",lim:"lim",exp:"exp",min:"min",max:"max",quad:" ",qquad:" "
};
const IDENTIFIERS=new Set(["sin","cos","tan","log","ln","lim","exp","min","max"]);
export function parseVenusMath(latex:string):MathNode|null{
 if(typeof latex!=="string"||latex.length>600||!latex.trim()||/[<>]/.test(latex))return null;
 let i=0,steps=0;const s=latex.trim();
 const row=(items:MathNode[]):MathNode=>items.length===1?items[0]:{kind:"row",items};
 function expr(depth:number,close=false):MathNode|null{
  if(depth>16)return null;
  const items:MathNode[]=[];
  while(i<s.length){
   if(++steps>1200)return null;
   const ch=s[i];
   if(ch==="}"){if(close){i++;return row(items);}return null;}
   if(/\s/.test(ch)){i++;continue;}
   if(ch==="^"||ch==="_")return null;
   let atom:MathNode|null=null;
   if(ch==="{"){i++;atom=expr(depth+1,true);}
   else if(ch==="\\"){
    i++;const start=i;
    while(/[A-Za-z]/.test(s[i]||"")&&i<s.length)i++;
    const cmd=s.slice(start,i);
    if(cmd==="frac"){
     if(s[i]!=="{")return null;
     i++;const numerator=expr(depth+1,true);if(!numerator||s[i]!=="{")return null;
     i++;const denominator=expr(depth+1,true);if(!denominator)return null;
     atom={kind:"fraction",numerator,denominator};
    }else if(cmd==="sqrt"){
     if(s[i]!=="{")return null;
     i++;const content=expr(depth+1,true);if(!content)return null;
     atom={kind:"sqrt",content};
    }else if(cmd==="left"||cmd==="right"){continue;}
    else if(cmd in COMMANDS){const t=COMMANDS[cmd];atom={kind:"token",text:t,role:IDENTIFIERS.has(cmd)?"mi":/[A-Za-zα-ωΑ-Ω]/.test(t)?"mi":"mo"};}
    else if(!cmd&&i<s.length&&"{}_%#$&".includes(s[i])){atom={kind:"token",text:s[i++],role:"mo"};}
    else return null;
   }else if(/[0-9.]/.test(ch)){
    const start=i;while(i<s.length&&/[0-9.]/.test(s[i]))i++;
    atom={kind:"token",text:s.slice(start,i),role:"mn"};
   }else if(/[a-zA-Z]/.test(ch)){i++;atom={kind:"token",text:ch,role:"mi"};}
   else if("+-=*/()[]|,!<>:".includes(ch)){i++;atom={kind:"token",text:ch,role:"mo"};}
   else return null;
   if(!atom)return null;
   let sup:MathNode|undefined,sub:MathNode|undefined;
   while(i<s.length&&(s[i]==="^"||s[i]==="_")){
    const type=s[i++];let value:MathNode|null=null;
    if(s[i]==="{"){i++;value=expr(depth+1,true);}
    else if(i<s.length){
     if(s[i]==="\\"){
      const start=i;i++;while(/[A-Za-z]/.test(s[i]||"")&&i<s.length)i++;
      const t=COMMANDS[s.slice(start+1,i)];if(t)value={kind:"token",text:t,role:"mi"};
     }else if(/[a-zA-Z0-9]/.test(s[i])){const t=s[i++];value={kind:"token",text:t,role:/[0-9]/.test(t)?"mn":"mi"};}
    }
    if(!value)return null;
    if(type==="^"){if(sup)return null;sup=value;}else{if(sub)return null;sub=value;}
   }
   items.push(sup||sub?{kind:"script",base:atom,...(sup?{sup}:{}),...(sub?{sub}:{})}:atom);
  }
  return close?null:row(items);
 }
 return expr(0);
}
