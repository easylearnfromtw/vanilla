/** Fixed-purpose PdfCraft inside a fresh Railway microVM, not inside WeiGuo. 
 * VM creation never forwards Railway credentials or WeiGuo secrets to guest.
 * Guard every run with Bubblewrap network isolation; no unsandboxed fallback.
 */
export const MAX_INPUT=2*1024*1024, MAX_OUTPUT=12*1024*1024;
const ARCHIVE_SHA="cdba2bec4d502d016dd78101a402d07845b708c49d77bc85e0ab640aca65372b";
const EXEC_SHA="073c9c4eb4193cbbf52211d5ad8102969b0731b3294e44c47ab289ac84d2640f";
const RELEASE="https://github.com/storytold/pdfcraft/releases/download/v0.9.0/pdfcraft-cli-0.9.0-linux-x86_64.tar.gz";

/** Content-addressed template builds once and is cached by Railway. */
export function templateFor(Sandbox) {
  const install=[
    "set -eu",
    "test \"$(uname -m)\" = x86_64",
    "mkdir -p /opt/pdfcraft",
    "curl --fail --location --silent --show-error --retry 2 --max-time 150 "+RELEASE+" -o /tmp/pdfcraft.tar.gz",
    "printf '%s  %s\\n' "+ARCHIVE_SHA+" /tmp/pdfcraft.tar.gz | sha256sum -c -",
    "mkdir -p /tmp/pdfcraft-extracted",
    "tar -xzf /tmp/pdfcraft.tar.gz -C /tmp/pdfcraft-extracted --no-same-owner --no-same-permissions",
    "install -m 0755 /tmp/pdfcraft-extracted/pdfcraft-cli-0.9.0-linux-x86_64/pdfcraft-cli /opt/pdfcraft/pdfcraft-cli",
    "printf '%s  %s\\n' "+EXEC_SHA+" /opt/pdfcraft/pdfcraft-cli | sha256sum -c -",
    "rm -rf /tmp/pdfcraft-extracted /tmp/pdfcraft.tar.gz"
  ].join("; ");
  return Sandbox.template().withPackages("curl","ca-certificates","bubblewrap").run(install);
}

const CMD=[
 "bwrap","--die-with-parent","--new-session","--unshare-user","--unshare-pid",
 "--unshare-ipc","--unshare-uts","--unshare-net","--cap-drop","ALL",
 "--ro-bind","/","/","--tmpfs","/tmp","--bind","/work","/work",
 "--proc","/proc","--dev","/dev","--chdir","/work","--setenv","HOME","/tmp","--"
].join(" ");
const CLI="/opt/pdfcraft/pdfcraft-cli";

/** Independent VM namespace test; bwrap failures are fatal. */
export async function verifyInsideVM(vm) {
 // Bubblewrap binds /work from the sandbox guest filesystem. It must exist
 // before the first namespace probe, including startup readiness checks.
 await vm.files.mkdir("/work");
 const sha=await vm.exec("sha256sum /opt/pdfcraft/pdfcraft-cli", {timeoutSec:5});
 if(sha.exitCode!==0 || !sha.stdout.trim().startsWith(EXEC_SHA+" "))
   throw new Error("PdfCraft executable digest failed");
 const outer=await vm.exec("readlink /proc/self/ns/net",{timeoutSec:5});
 const inner=await vm.exec(CMD+" readlink /proc/self/ns/net",{timeoutSec:8});
 if(outer.exitCode!==0 || inner.exitCode!==0 ||
    !String(outer.stdout).trim().startsWith("net:[") ||
    !String(inner.stdout).trim().startsWith("net:[") ||
    String(inner.stdout).trim()===String(outer.stdout).trim())
   throw new Error("Nested network sandbox not proven");
}

/** The caller enforces concurrency limits and owns auth. */
export async function mergeInEphemeralVM(Sandbox, inputs) {
 if(!Array.isArray(inputs) || ![2,3].includes(inputs.length))throw new Error("Invalid number of PDFs");
 for(const data of inputs) {
  if(!(data instanceof Uint8Array) || data.length<32 || data.length>MAX_INPUT ||
     !validPdf(data))throw new Error("Invalid PDF");
 }
 let vm;
 try {
  vm=await Sandbox.create(templateFor(Sandbox), { networkIsolation:"ISOLATED", idleTimeoutMinutes:1 }); // no inherited env/secrets
  await verifyInsideVM(vm);
  for(let i=0;i<inputs.length;i++)
   await vm.files.write("/work/source-"+(i+1)+".pdf",inputs[i],{mode:0o600});
  const command=CMD+" "+CLI+" combine "+inputs.map((_,i)=>"/work/source-"+(i+1)+".pdf").join(" ")+" --out /work/merged.pdf";
  const result=await vm.exec(command,{timeoutSec:35});
  if(result.exitCode!==0 || result.timedOut)throw new Error("Isolated native CLI failed");
  const stat=await vm.files.stat("/work/merged.pdf");
  if(!stat || stat.size<32 || stat.size>MAX_OUTPUT)throw new Error("Merged PDF exceeds bounds");
  const output=await vm.files.read("/work/merged.pdf",{format:"bytes"});
  if(!(output instanceof Uint8Array) || !validPdf(output) || output.length>MAX_OUTPUT)
   throw new Error("Output PDF invalid");
  return output;
 } finally {
  if(vm)await vm.destroy().catch(()=>{ /* VM idle timeout remains a secondary cleanup backstop */ });
 }
}
export function validPdf(data) {
 if(!(data instanceof Uint8Array)||data.length<32)return false;
 return Buffer.from(data.subarray(0,5)).toString("ascii")==="%PDF-" &&
  Buffer.from(data.subarray(-2048)).includes(Buffer.from("%%EOF"));
}
/** A fixed, redacted category only: never include SDK error text or tokens in logs. */
export function classifyVmFailure(error) {
 const m=String(error?.message||"").toLowerCase();
 if(m.includes("nested network sandbox"))return "network_namespace";
 if(m.includes("executable digest"))return "binary_integrity";
 if(/\\b401\\b|\\b403\\b|unauthori[sz]ed|forbidden|permission denied/.test(m))return "auth_denied";
 if(/\\b429\\b|quota|sandbox limit|too many/.test(m))return "quota";
 if(/timeout|timed out|deadline/.test(m))return "timeout";
 if(/template|build failed|apt-get|curl|sha256sum/.test(m))return "template_build";
 return "unknown";
}
/** Starting a VM is a paid operation: invoke once at explicit service enable. */
export async function startupPreflight(Sandbox) {
 let vm, stage="create";
 try {
  vm=await Sandbox.create(templateFor(Sandbox), { networkIsolation:"ISOLATED", idleTimeoutMinutes:1 });
  stage="verify";
  await verifyInsideVM(vm);
  return true;
 }catch(error) {
  // Do not reveal raw Railway SDK/GraphQL failure details in application logs.
  throw new Error("pdfcraft_preflight_"+stage+"_"+classifyVmFailure(error));
 }finally {
  if(vm)await vm.destroy().catch(()=>{});
 }
}
