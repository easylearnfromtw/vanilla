/** Fixed-purpose PdfCraft inside fresh Railway microVMs.
 * Only the verified CLI bytes enter each VM; no Railway OAuth or family keys
 * are passed. Bubblewrap's independent no-egress namespace is mandatory.
 */
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";

export const MAX_INPUT=2*1024*1024, MAX_OUTPUT=12*1024*1024;
const EXEC_SHA="073c9c4eb4193cbbf52211d5ad8102969b0731b3294e44c47ab289ac84d2640f";
const CLI="/opt/pdfcraft/pdfcraft-cli";
const BUNDLE="/srv/pdfcraft-cli";
const OPTIONS=Object.freeze({networkIsolation:"ISOLATED",idleTimeoutMinutes:1});
const CMD=[
 "bwrap","--die-with-parent","--new-session","--unshare-user","--unshare-pid",
 "--unshare-ipc","--unshare-uts","--unshare-net","--cap-drop","ALL",
 "--ro-bind","/","/","--tmpfs","/tmp","--bind","/work","/work",
 "--proc","/proc","--dev","/dev","--chdir","/work","--setenv","HOME","/tmp","--"
].join(" ");

let verifiedBundle;
async function nativeBytes() {
 if(verifiedBundle)return verifiedBundle;
 const bytes=await readFile(BUNDLE);
 if(createHash("sha256").update(bytes).digest("hex")!==EXEC_SHA)
   throw new Error("Bundled CLI integrity mismatch");
 verifiedBundle=bytes;
 return bytes;
}

export function validPdf(data) {
 if(!(data instanceof Uint8Array)||data.length<32)return false;
 return Buffer.from(data.subarray(0,5)).toString("ascii")==="%PDF-" &&
  Buffer.from(data.subarray(-2048)).includes(Buffer.from("%%EOF"));
}

// The fresh VM's preinstalled image may not have bwrap. Install it before
// handling any user documents, but NEVER execute the PdfCraft CLI outside it.
const BWRAP_INSTALL = `sh -ec 'set -eu
if command -v bwrap >/dev/null 2>&1; then exit 0; fi
if [ "$(id -u)" = "0" ]; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends bubblewrap
elif command -v sudo >/dev/null 2>&1; then
  sudo -n apt-get update -qq
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends bubblewrap
else
  exit 84
fi
command -v bwrap >/dev/null 2>&1'`;

export async function prepareGuest(vm) {
 const cpu=await vm.exec("uname -m",{timeoutSec:5});
 if(cpu.exitCode!==0 || String(cpu.stdout).trim()!=="x86_64")
  throw new Error("Guest architecture unsupported");
 // Creation must precede bwrap's bind-mount namespace admission.
 await vm.files.mkdir("/work");
 const deps=await vm.exec(BWRAP_INSTALL,{timeoutSec:120});
 if(deps.exitCode!==0||deps.timedOut)throw new Error("Bubblewrap guest install failed");
 await vm.files.write(CLI,await nativeBytes(),{mode:0o755});
 await verifyInsideVM(vm);
}

/** A checksum and distinct actual guest network namespace are required. */
export async function verifyInsideVM(vm) {
 const sha=await vm.exec("sha256sum "+CLI,{timeoutSec:5});
 if(sha.exitCode!==0 || !String(sha.stdout).trim().startsWith(EXEC_SHA+" "))
  throw new Error("PdfCraft executable digest failed");
 const outer=await vm.exec("readlink /proc/self/ns/net",{timeoutSec:5});
 const inner=await vm.exec(CMD+" readlink /proc/self/ns/net",{timeoutSec:8});
 if(outer.exitCode!==0 || inner.exitCode!==0 ||
    !String(outer.stdout).trim().startsWith("net:[") ||
    !String(inner.stdout).trim().startsWith("net:[") ||
    String(inner.stdout).trim()===String(outer.stdout).trim())
   throw new Error("Nested network sandbox not proven");
}

export async function mergeInsideVM(vm,inputs) {
 for(let i=0;i<inputs.length;i++)
  await vm.files.write("/work/source-"+(i+1)+".pdf",inputs[i],{mode:0o600});
 const command=CMD+" "+CLI+" combine "+inputs.map((_,i)=>"/work/source-"+(i+1)+".pdf").join(" ")+" --out /work/merged.pdf";
 const result=await vm.exec(command,{timeoutSec:35});
 if(result.exitCode!==0||result.timedOut)throw new Error("Isolated native CLI failed");
 const stat=await vm.files.stat("/work/merged.pdf");
 if(!stat || stat.size<32||stat.size>MAX_OUTPUT)throw new Error("Merged PDF exceeds bounds");
 const output=await vm.files.read("/work/merged.pdf",{format:"bytes"});
 if(!(output instanceof Uint8Array)||output.length>MAX_OUTPUT||!validPdf(output))
  throw new Error("Output PDF invalid");
 return output;
}

export async function mergeInEphemeralVM(Sandbox,inputs,prepare=prepareGuest) {
 if(!Array.isArray(inputs)||![2,3].includes(inputs.length))throw new Error("Invalid number of PDFs");
 for(const data of inputs)
  if(!(data instanceof Uint8Array)||data.length>MAX_INPUT||!validPdf(data))
   throw new Error("Invalid PDF");
 let vm;
 try {
  vm=await Sandbox.create(OPTIONS);
  await prepare(vm);
  return await mergeInsideVM(vm,inputs);
 }finally{
  if(vm)await vm.destroy().catch(()=>{});
 }
}

/** Minimal standards-compliant one-page PDF fixture for a REAL native merge. */
function fixture(label) {
 const content=Buffer.from("BT /F1 18 Tf 72 720 Td ("+label+") Tj ET\n");
 const objects=[
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  "<< /Length "+content.length+" >>\nstream\n"+content.toString("ascii")+"endstream"
 ];
 let body="%PDF-1.4\n",offsets=[0];
 for(let i=0;i<objects.length;i++){
  offsets.push(Buffer.byteLength(body,"ascii"));
  body+=(i+1)+" 0 obj\n"+objects[i]+"\nendobj\n";
 }
 const xref=Buffer.byteLength(body,"ascii");
 body+="xref\n0 6\n0000000000 65535 f \n"+
  offsets.slice(1).map(x=>String(x).padStart(10,"0")+" 00000 n \n").join("")+
  "trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n"+xref+"\n%%EOF\n";
 return Buffer.from(body,"ascii");
}

export function classifyVmFailure(error) {
 const m=String(error?.message||"").toLowerCase();
 if(m.includes("nested network sandbox"))return "network_namespace";
 if(m.includes("executable digest")||m.includes("integrity"))return "binary_integrity";
 if(m.includes("guest architecture"))return "architecture";
 if(m.includes("bubblewrap guest install"))return "bubblewrap_install";
 if(m.includes("isolated native cli")||m.includes("output pdf"))return "native_merge";
 if(/\b401\b|\b403\b|unauthori[sz]ed|forbidden|permission denied/.test(m))return "auth_denied";
 if(/\b429\b|quota|sandbox limit|too many/.test(m))return "quota";
 if(/timeout|timed out|deadline/.test(m))return "timeout";
 if(/template|build failed|apt-get|curl|sha256sum/.test(m))return "template_build";
 return "unknown";
}

/** Live admission requires a checksum, no-egress namespace and true PDF merge. */
export async function startupPreflight(Sandbox,prepare=prepareGuest) {
 let vm,stage="create";
 try {
  vm=await Sandbox.create(OPTIONS);
  stage="prepare";
  await prepare(vm);
  stage="native";
  await mergeInsideVM(vm,[fixture("VANILLA_SMOKE_A"),fixture("VANILLA_SMOKE_B")]);
  return true;
 }catch(error){
  // Log only static categories: no raw Railway API errors or token fragments.
  throw new Error("pdfcraft_preflight_"+stage+"_"+classifyVmFailure(error));
 }finally{
  if(vm)await vm.destroy().catch(()=>{});
 }
}
