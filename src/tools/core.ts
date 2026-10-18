/** Vanilla Tool SDK — additive, no access to existing chat or Drive credentials. */
export type MemberId = "zekai" | "zewei" | "xiaofen";
export type Domain = "calendar" | "knowledge" | "travel" | "health";
export type Scope = "private" | "family";
export interface Principal { memberId: MemberId; authenticated: boolean; }
export interface RecordPolicy { owner: MemberId; scope: Scope; domain: Domain; }
export interface ToolContext { principal: Principal; approve?: (message:string)=>Promise<boolean>; }
export interface ToolDefinition<I=unknown,O=unknown> {
  name: string; domain: Domain; description: string; mutates: boolean;
  validate: (value:unknown)=>value is I;
  run: (input:I,context:ToolContext)=>Promise<O>;
}
export function canRead(principal:Principal,policy:RecordPolicy):boolean {
  return principal.authenticated && (policy.owner===principal.memberId || (policy.scope==="family" && policy.domain!=="health"));
}
export function canWrite(principal:Principal,policy:RecordPolicy):boolean {
  return principal.authenticated && policy.owner===principal.memberId;
}
export class ToolRegistry {
  private tools=new Map<string,ToolDefinition<any,any>>();
  register<I,O>(tool:ToolDefinition<I,O>):void {
    if(this.tools.has(tool.name))throw new Error("Duplicate tool: "+tool.name);
    this.tools.set(tool.name,tool);
  }
  list():Array<{name:string;domain:Domain;description:string;mutates:boolean}> {
    return [...this.tools.values()].map(({name,domain,description,mutates})=>({name,domain,description,mutates}));
  }
  async invoke(name:string,input:unknown,context:ToolContext):Promise<unknown> {
    if(!context.principal.authenticated)throw new Error("Authentication required");
    const tool=this.tools.get(name);
    if(!tool)throw new Error("Unknown tool");
    if(!tool.validate(input))throw new Error("Invalid tool input");
    if(tool.mutates && (!context.approve || !(await context.approve("允許執行 "+tool.description+"？"))))throw new Error("Approval required");
    return tool.run(input,context);
  }
}
export function isObject(x:unknown):x is Record<string,unknown>{return typeof x==="object"&&x!==null&&!Array.isArray(x);}
