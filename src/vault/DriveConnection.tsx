import {useState} from "react";
import {authorizeDrive,revokeDrive} from "./google-auth";
import {listVaultFiles} from "./drive";
export default function DriveConnection(){
  const [token,setToken]=useState("");
  const [expiry,setExpiry]=useState(0);
  const [files,setFiles]=useState<string[]>([]);
  const [status,setStatus]=useState("尚未授權 Google Drive");
  const [busy,setBusy]=useState(false);
  async function connect(){
    setBusy(true);
    try{
      const result=await authorizeDrive();
      setToken(result.token);setExpiry(result.expiresAt);
      const listed=await listVaultFiles(result.token);
      setFiles(listed.filter(f=>f.name.startsWith("vanilla-v1-")).map(f=>f.name));
      setStatus("Google Drive appDataFolder 已授權，讀取成功");
    }catch(e){setStatus(e instanceof Error?e.message:"授權失敗");}
    finally{setBusy(false);}
  }
  function disconnect(){if(token)revokeDrive(token);setToken("");setExpiry(0);setFiles([]);setStatus("已中斷 Google 授權");}
  return <div style={{marginTop:24,padding:20,border:"1px solid #d1d5db",borderRadius:14}}>
    <h3>Google Drive 專屬加密雲端</h3>
    <p>一個 Google 帳號儲存三位家庭成員各自加密的資料。此處僅測試 Google 授權與 appDataFolder 讀取，不會上傳個人資料。</p>
    <p role="status">{status}</p>
    {token&&<p>授權到期時間：{new Date(expiry).toLocaleTimeString("zh-TW")}（到期需重新授權）</p>}
    <button type="button" disabled={busy} onClick={token?disconnect:connect}>{busy?"連線中…":token?"中斷 Google 授權":"連接 Google Drive"}</button>
    {token&&<p>找到 {files.length} 個 Vanilla 加密快照（僅顯示檔名）。</p>}
    <small>授權權杖只保存在目前頁面的記憶體，不寫入 localStorage。尚未實作家庭成員登入、保險庫解鎖或同步。</small>
  </div>;
}
