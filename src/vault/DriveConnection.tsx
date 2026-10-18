import {useState} from "react";
import {authorizeDrive,revokeDrive} from "./google-auth";
import {listVaultFiles} from "./drive";
import {MEMBERS,type MemberId} from "./crypto";

export default function DriveConnection(){
  const [member,setMember]=useState<MemberId>("zekai");
  const [token,setToken]=useState("");
  const [email,setEmail]=useState("");
  const [status,setStatus]=useState("請選擇成員，再授權該成員自己的 Google 帳號");
  const [busy,setBusy]=useState(false);
  const [count,setCount]=useState<number|null>(null);
  function disconnect(){if(token)revokeDrive(token);setToken("");setEmail("");setCount(null);}
  function switchMember(next:MemberId){disconnect();setMember(next);setStatus("已切換成員，請重新授權個人 Google Drive");}
  async function connect(){
    setBusy(true);
    try{
      const result=await authorizeDrive();
      const identityResponse=await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{Authorization:"Bearer "+result.token}});
      if(!identityResponse.ok)throw new Error("無法確認授權帳號");
      const identity=await identityResponse.json() as {email?:string;id?:string};
      if(!identity.email||!identity.id)throw new Error("缺少 Google 帳號資訊");
      const listed=await listVaultFiles(result.token);
      setToken(result.token);setEmail(identity.email);
      setCount(listed.filter(f=>f.name.startsWith("vanilla-v1-"+member+".encrypted.json")).length);
      setStatus("已連接個人 Google Drive；目前只進行讀取測試");
    }catch(e){setStatus(e instanceof Error?e.message:"授權失敗");}
    finally{setBusy(false);}
  }
  return <div style={{marginTop:24,padding:20,border:"1px solid #d1d5db",borderRadius:14}}>
    <h3>個人 Google Drive</h3>
    <p>每位家庭成員使用自己的 Google 帳號。此功能只測試連線，不會上傳資料。</p>
    <label htmlFor="drive-member">家庭成員</label>
    <select id="drive-member" value={member} disabled={busy} onChange={e=>switchMember(e.target.value as MemberId)}>
      {(Object.keys(MEMBERS) as MemberId[]).map(id=><option key={id} value={id}>{MEMBERS[id]}</option>)}
    </select>
    <p role="status">{status}</p>
    {email&&<p>已授權帳號：{email}</p>}
    <button type="button" disabled={busy} onClick={token?disconnect:connect}>{busy?"連線中…":token?"中斷連線":"連接此成員的 Google Drive"}</button>
    {count!==null&&<p>找到 {count} 個符合此成員名稱的加密快照。</p>}
    <small>選擇成員不等於身分驗證。正式同步前，必須驗證每個 Google 帳號與成員的固定綁定，並完成保險庫解鎖。</small>
  </div>;
}
