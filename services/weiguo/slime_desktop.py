"""Slime desktop on-boarding — explicit consent, one-time pairing, reconnect and quit.

Entry point for the packaged Slime-Owner / Slime-Friend Windows executables,
and the macOS/Linux source launchers. Only calls the fixed self-configured
WeiGuo HTTPS origin. Never publishes a local port or runs remote shell code.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import platform
import re
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit

from slime_runner_agent import _http, run as run_model

DEFAULT_SERVER="https://weiguo-browser-production.up.railway.app"
CODE=re.compile(r"^[A-Za-z0-9_-]{24,160}$")
SHORT_CODE=re.compile(r"^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$")
NAME=re.compile(r"^[^\x00-\x1f\x7f]{1,64}$")


def _role():
    target=os.getenv("SLIME_INSTALL_ROLE","").strip().lower()
    if target in ("friend","owner"):
        return target
    return "friend" if "friend" in Path(sys.argv[0]).stem.lower() else "owner"


def _settings_path(role=None):
    home=Path.home()/".vanilla"/"slime"
    return home/(("friend" if (role or _role())=="friend" else "owner")+".json")


def _server(raw):
    url=urlsplit(raw.strip().rstrip("/"))
    if (url.scheme!="https" or not url.hostname or url.username or url.password
        or url.query or url.fragment or url.path or url.port not in (None,443)
        or url.hostname in ("localhost","127.0.0.1") or url.hostname.endswith(".local")):
        raise ValueError("WeiGuo 後端必須是可信的 HTTPS 網域，不得包含路徑")
    return "https://"+url.hostname


def _invite(value):
    """Accept new 4-4-4 pairing code or old long URL/token for compatibility."""
    raw=value.strip()
    if raw.startswith("https://"):
        u=urlsplit(raw)
        if not u.hostname or u.username or u.password or not u.fragment.startswith("slime="):
            raise ValueError("配對連結格式不正確")
        raw=u.fragment[len("slime="):]
    compact=re.sub(r"[-\s]","",raw).upper()
    if SHORT_CODE.fullmatch(compact):
        return "-".join((compact[:4],compact[4:8],compact[8:]))
    if CODE.fullmatch(raw):
        return raw
    raise ValueError("請輸入 12 位配對碼（XXXX-XXXX-XXXX）或有效的舊邀請連結")



def _load():
    path=_settings_path()
    if not path.exists():
        return None
    try:
        obj=json.loads(path.read_text("utf-8"))
        if (not isinstance(obj,dict) or obj.get("role")!=_role()
            or not isinstance(obj.get("token"),str)
            or not 32<=len(obj["token"])<=256
            or not isinstance(obj.get("node_id"),str)
            or not re.fullmatch(r"[a-f0-9]{24}",obj["node_id"])):
            raise ValueError("配對資料不完整")
        obj["server"]=_server(obj.get("server",""))
        return obj
    except (OSError,ValueError,TypeError):
        raise ValueError("本機配對設定損壞；請先備份資料再重新配對") from None


def _save(settings):
    path=_settings_path()
    path.parent.mkdir(parents=True,exist_ok=True)
    # Atomic replacement and restrictive permissions wherever the OS supports them.
    handle,name=tempfile.mkstemp(prefix=".slime-",dir=path.parent)
    try:
        if hasattr(os,'fchmod'):
            os.fchmod(handle,0o600)
        with os.fdopen(handle,"w",encoding="utf-8") as output:
            json.dump(settings,output,ensure_ascii=False)
            output.flush()
            os.fsync(output.fileno())
        os.replace(name,path)
        if os.name!="nt":
            os.chmod(path,0o600)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def _confirm(question):
    return input(question+" [y/N] ").strip().lower() in ("y","yes")


def setup():
    role=_role()
    previous=_load()
    if previous:
        print("這台電腦已配對："+previous["node_id"])
        print("如需重新安裝，請先選擇『退出並撤銷配對』，避免遺失舊裝置憑證。")
        return previous
    print("═ Slime · Vanilla AI ═")
    print("使用者身分："+("本人電腦" if role=="owner" else "朋友共享節點"))
    print("只會向指定 WeiGuo HTTPS 服務回報節點狀態；不讀取個人文件。")
    print("若 Owner 明確核准模型推論，聊天提示會傳送到此電腦的本地 Ollama。")
    server=_server(input("WeiGuo API 網址 [Enter 使用預設]：").strip() or DEFAULT_SERVER)
    label=input("這台電腦的顯示名稱：").strip()
    if not NAME.fullmatch(label):
        raise ValueError("請填入 1–64 字的裝置名稱")
    print("請向 Ceres Telegram Owner 取得 10 分鐘有效的短配對碼。")
    secret=_invite(input("配對碼（例如 XXXX-XXXX-XXXX，亦可貼連結）："))
    if not _confirm("是否同意加入 Slime、回報硬體狀態並可隨時退出？"):
        print("未取得同意，沒有建立任何配對。")
        return None
    # The invite secret is sent only to the owner-controlled WeiGuo HTTPS backend.
    compact=re.sub(r"[-\s]","",secret).upper()
    short=bool(SHORT_CODE.fullmatch(compact))
    endpoint="/v1/slime/node/pair" if short else "/v1/slime/node/join"
    payload={"code":secret,"role":role,"label":label} if short else {
        "invite":secret,"role":role,"label":label}
    response=_http("POST",server+endpoint,payload,timeout=12)
    token=response.get("token")
    nodeid=response.get("node_id")
    if not isinstance(token,str) or not 32<=len(token)<=256 or not isinstance(nodeid,str):
        raise ValueError("WeiGuo 配對結果無效；沒有保存憑證")
    obj={"role":role,"server":server,"label":label,
         "node_id":nodeid,"token":token}
    # Save first: one-time invitations must never be lost when the immediate
    # heartbeat fails because of a temporary network or server interruption.
    _save(obj)
    print("配對憑證已安全保存。裝置 ID："+nodeid)
    try:
        from slime_runner_agent import _heartbeat
        state=_heartbeat(server,token)
        if not state.get("ok"):
            raise ValueError("heartbeat rejected")
        print("✓ 配對已綁定 · WeiGuo 心跳已驗證")
        print("下一步：Telegram → Slime 節點確認在線；需要使用模型則另行核准。")
    except (HTTPError,URLError,TimeoutError,OSError,ValueError,KeyError,TypeError):
        print("! 伺服器已回傳節點憑證，但首次心跳尚未確認。")
        print("  請保持程式開啟或使用 --status 重試；不要重新消耗配對碼。")
    return obj


def leave(settings):
    print("將解除 Slime 配對，刪除本機憑證並使該節點失效。")
    if not _confirm("確定退出？"):
        return
    try:
        _http("POST",settings["server"]+"/v1/slime/node/leave",
              authorization=settings["token"],timeout=12)
    except Exception:
        print("無法聯絡後端；為避免留下可用憑證，本機不會直接刪除。")
        print("請由 Ceres Telegram 管理者撤銷節點，再重試。")
        return
    _settings_path().unlink(missing_ok=True)
    print("已解除配對並清除本機 Token。")


def status(settings):
    from slime_runner_agent import _heartbeat, _models
    try:
        state=_heartbeat(settings["server"],settings["token"])
        if not state.get("ok"):
            print("○ WeiGuo 尚未接受節點心跳，請檢查節點授權。")
            return False
    except HTTPError as exc:
        print("○ WeiGuo 心跳失敗：HTTP "+str(exc.code)+
              ("（節點憑證無效／已撤銷）" if exc.code in (401,403) else ""))
        return False
    except (URLError,TimeoutError,OSError,ValueError,TypeError,KeyError):
        print("○ 無法連線 WeiGuo HTTPS；請檢查網路、系統代理與防火牆政策。")
        return False
    print("✓ 綁定有效 · 心跳已確認 · "+settings["label"])
    print("節點共享："+("允許" if state.get("owner_enabled") else "Owner 已停用"))
    print("模型推論："+("已由 Owner 核准" if state.get("inference_enabled") else "未核准／關閉"))
    try:
        models=_models()
        print("本機 Ollama："+(", ".join(models) if models else "沒有已下載的模型"))
    except (HTTPError,URLError,TimeoutError,OSError,ValueError,TypeError,KeyError):
        print("本機 Ollama：未連線（不影響節點配對和心跳）")
    return True


def main():
    try:
        flags=set(sys.argv[1:])
        if flags-{"--setup","--status","--leave","--help"} or len(flags)>1:
            raise ValueError("可用參數：--setup、--status、--leave")
        if "--help" in flags:
            print("Slime 下載 → 一次性邀請配對 → 授權後啟用 Ollama → Ctrl+C 停止共享")
            print("--status 查詢連線；--leave 退出並撤銷；--setup 顯示配對狀態")
            return 0
        config=_load()
        if "--leave" in flags:
            if config:leave(config)
            else: print("尚未配對。")
            return 0
        if not config or "--setup" in flags:
            config=setup()
        if not config:return 0
        if "--status" in flags:
            return 0 if status(config) else 2
        print("啟動 Slime 節點："+config["label"])
        print("若需離線後恢復：本程式會自動重試連線，不需要重新輸入配對碼。")
        print("此電腦只會在你保持程式開啟、節點授權有效時回報／執行。")
        print("按 Ctrl+C 可隨時停止；永久退出請使用 --leave。")
        os.environ["VANILLA_SERVER_URL"]=config["server"]
        os.environ["SLIME_NODE_TOKEN"]=config["token"]
        try:
            run_model()
        except KeyboardInterrupt:
            print("已停止共享；節點稍後會顯示離線。")
        return 0
    except (ValueError,OSError) as exc:
        print("Slime 無法啟動："+str(exc),file=sys.stderr)
        return 2


if __name__=="__main__":
    raise SystemExit(main())
