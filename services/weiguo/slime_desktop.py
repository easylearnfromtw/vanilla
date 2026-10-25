"""Slime desktop on-boarding — explicit consent, one-time pairing, reconnect and quit.

Entry point for the packaged Slime-Owner / Slime-Friend Windows executables,
and the macOS/Linux source launchers. Only calls the fixed self-configured
WeiGuo HTTPS origin. Never publishes a local port or runs remote shell code.
"""
from __future__ import annotations

import json
import ipaddress
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


def _public_ip():
    """Called only after consent; no credential is sent to this external service."""
    try:
        data=_http("GET","https://api64.ipify.org?format=json",timeout=6)
        address=ipaddress.ip_address(data.get("ip","") if isinstance(data,dict) else "")
        return str(address) if address.is_global else ""
    except (HTTPError,URLError,TimeoutError,OSError,ValueError,TypeError):
        print("公開 IP 查詢暫不可用；不影響 Slime 配對。")
        return ""



def pair_with_consent(*, server, label, secret, consent, role=None,
                      geo_opt_in=False, shutdown_opt_in=False, public_ip=""):
    """Shared, explicit pairing for desktop and CLI; never logs/returns token in UI text.

    Save the one-time credential BEFORE checking heartbeat; a transient outage
    must not force a user to consume another code.
    """
    role=role or _role()
    if role!=_role() or role not in ("owner","friend"):
        raise PermissionError("安裝版本與配對角色不符；請下載對應的 Owner／Friend 版本。")
    server=_server(server)
    label=label.strip() if isinstance(label,str) else ""
    if not NAME.fullmatch(label):
        raise ValueError("裝置名稱需為 1–64 個字，不能包含換行。")
    secret=_invite(secret)
    if not consent:
        return None, False
    geo_opt_in=geo_opt_in is True
    shutdown_opt_in=shutdown_opt_in is True
    compact=re.sub(r"[-\s]","",secret).upper()
    short=bool(SHORT_CODE.fullmatch(compact))
    endpoint="/v1/slime/node/pair" if short else "/v1/slime/node/join"
    payload={"code":secret,"role":role,"label":label,
             "geo_opt_in":geo_opt_in,"public_ip":public_ip if geo_opt_in else "",
             "shutdown_opt_in":shutdown_opt_in} if short else {
        "invite":secret,"role":role,"label":label,
        "geo_opt_in":geo_opt_in,"public_ip":public_ip if geo_opt_in else "",
        "shutdown_opt_in":shutdown_opt_in}
    response=_http("POST",server+endpoint,payload,timeout=12)
    token=response.get("token") if isinstance(response,dict) else None
    nodeid=response.get("node_id") if isinstance(response,dict) else None
    if (not isinstance(token,str) or not 32<=len(token)<=256 or
        not isinstance(nodeid,str) or not re.fullmatch(r"[a-f0-9]{24}",nodeid)):
        raise ValueError("配對服務尚未回傳有效憑證；未寫入設定，請先確認後端狀態。")
    obj={"role":role,"server":server,"label":label,
         "node_id":nodeid,"token":token,
         "geo_opt_in":geo_opt_in,"shutdown_opt_in":shutdown_opt_in}
    _save(obj)
    try:
        from slime_runner_agent import _heartbeat
        state=_heartbeat(server,token)
        if not isinstance(state,dict) or state.get("ok") is not True:
            raise ValueError("HEARTBEAT_NOT_CONFIRMED")
        verified=True
    except (HTTPError,URLError,TimeoutError,OSError,ValueError,KeyError,TypeError):
        verified=False
    return obj, verified

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
    secret=None
    gecko_join=False
    if role=="friend" and sys.stdin.isatty() and _confirm(
        "要在目前的 LAN／Wi-Fi 搜尋已同意分享的 Gecko 節點（不掃描其他電腦）？"
    ):
        try:
            from gecko_lan import discover,request_invite
            peers=discover(server)
            if peers:
                for i,peer in enumerate(peers,1):
                    print(f"  {i}. {peer['name']} · {peer['ip']}")
                selection=input("選擇 Gecko 主機編號 [Enter 改用 Telegram 配對]：").strip()
                if selection.isdigit() and 1<=int(selection)<=len(peers):
                    peer=peers[int(selection)-1]
                    if _confirm("確認接受 "+peer["name"]+" 的 Slime Friend 配對？不會自動安裝或開啟推論"):
                        print("加入方式：1. 接收電腦確認  2. Telegram Owner 核准")
                        choice=input("選擇核准方式 [Enter 使用 1]：").strip()
                        mode="owner" if choice=="2" else "receiver"
                        if choice not in ("","1","2"):
                            raise ValueError("請選擇 1 或 2")
                        secret=request_invite(peer,server,mode=mode)
                        gecko_join=True
                        print("✓ Gecko 一次性配對授權已取得（不需輸入 Telegram 代碼）")
            else:
                print("附近沒有可用的 Gecko 分享，改用一般 Slime 配對。")
        except (OSError,ValueError,HTTPError,URLError,TimeoutError):
            print("Gecko 授權暫時不可用；仍可使用一般配對。")
    if secret is None:
        print("請向 Ceres Telegram Owner 取得 10 分鐘有效的短配對碼。")
        secret=_invite(input("配對碼（例如 XXXX-XXXX-XXXX，亦可貼連結）："))
    if not _confirm("是否同意加入 Slime、回報硬體狀態並可隨時退出？"):
        print("未取得同意，沒有建立任何配對。")
        return None
    is_gecko=gecko_join
    if is_gecko:
        # Gecko grants never escalate to public-IP disclosure or power control.
        geo_opt_in=False;public_ip="";shutdown_opt_in=False
        print("Gecko 安全配對：不啟用 IP 位置分享與遠端關機，推論仍需 Owner 核准。")
    else:
        print("隱私選項：IP 與約略地區只會顯示於已授權的 Telegram Owner 管理頁。")
        geo_opt_in=_confirm("同意經 IPify HTTPS 查詢裝置對外 IP，供 Owner 估算城市？") if sys.stdin.isatty() else False
        public_ip=_public_ip() if geo_opt_in else ""
        print("電源控制：預設停用。若核准，Telegram Owner 仍需二次確認才能關機。")
        shutdown_opt_in=_confirm("允許 Telegram Owner 遠端關閉本機電源？") if sys.stdin.isatty() else False
    obj, verified=pair_with_consent(
        server=server,label=label,secret=secret,role=role,consent=True,
        geo_opt_in=geo_opt_in,shutdown_opt_in=shutdown_opt_in,public_ip=public_ip)
    print("配對憑證已安全保存。裝置 ID："+obj["node_id"])
    if verified:
        print("✓ 配對已綁定 · WeiGuo 心跳已驗證")
        print("下一步：Telegram → Slime 節點確認在線；需要使用模型則另行核准。")
    else:
        print("! 配對成功，首次心跳尚未確認。請保持程式開啟或使用 --status 重試。")
        print("  不要重新消耗同一組一次性配對碼。")
    return obj


def setup_fleet():
    """One-time registration for an operator-authorized server host.

    Deployment credential is a secret provisioned by the operator's management
    tooling; it is never embedded in the executable or stored after redemption.
    """
    if _role()!="friend":
        raise ValueError("Gecko Fleet 受管機器請使用 Slime-Friend 程式")
    secret=os.getenv("GECKO_ENROLLMENT_TOKEN","").strip()
    if not re.fullmatch(r"gck_[A-Za-z0-9_-]{40,120}",secret):
        raise ValueError("未由機房部署管理員注入有效的 GECKO_ENROLLMENT_TOKEN")
    approved=os.getenv("GECKO_DEVICE_CONSENT","")=="approved_by_operator"
    if not approved:
        if not sys.stdin.isatty() or not _confirm(
            "你是這台伺服器的管理者，是否同意加入已授權的 Gecko Fleet？"
        ):
            print("主機未確認授權，沒有安裝或連線。")
            return None
    server=_server(os.getenv("GECKO_SERVER",DEFAULT_SERVER))
    label=os.getenv("GECKO_HOST_LABEL","").strip() or platform.node()[:64]
    if not NAME.fullmatch(label):
        raise ValueError("主機顯示名稱不符合 1–64 字規範")
    response=_http("POST",server+"/v1/gecko/agent/enroll",
      {"token":secret,"label":label,"device_consent":True},timeout=15)
    nodeid=response.get("node_id")
    token=response.get("token")
    if not isinstance(nodeid,str) or not re.fullmatch(r"[a-f0-9]{24}",nodeid) or not isinstance(token,str) or len(token)<32:
        raise ValueError("Gecko 受管註冊結果無效")
    config={"role":"friend","server":server,"label":label,"node_id":nodeid,
            "token":token,"geo_opt_in":False,"shutdown_opt_in":False,
            "gecko_fleet":True,"pool_id":response["poolId"]}
    # A returned one-time credential must survive transient heartbeat failure.
    _save(config)
    print("✓ Gecko Fleet 受管主機已加入："+nodeid)
    print("無 Telegram 代碼 · 無遠端自動安裝 · 模型推論預設關閉")
    try:
        from slime_runner_agent import _heartbeat
        _heartbeat(server,token)
        print("✓ 首次節點心跳已完成")
    except (HTTPError,URLError,TimeoutError,OSError,ValueError,KeyError):
        print("首次心跳未完成，稍後會自動重試；不得重複消耗批次名額。")
    return config


def open_reward_claim(settings):
    """Open a one-time Google claim flow using a token scoped ONLY to rewards.

    The node bearer token is never placed in browser URLs; only an expiring
    one-claim ticket is returned by the authenticated backend.
    """
    import webbrowser
    # Score requires an authenticated hardware heartbeat before the claim.
    # A missing CPU/RAM report fails closed; the user can retry --reward.
    from slime_runner_agent import _heartbeat
    _heartbeat(settings["server"],settings["token"])
    reply=_http("POST",settings["server"]+"/v1/slime/node/reward-ticket",
                {},authorization=settings["token"],timeout=12)
    link=reply.get("url") if isinstance(reply,dict) else None
    from urllib.parse import urlsplit
    parts=urlsplit(link) if isinstance(link,str) else None
    if (not parts or link.split("#",1)[0]!=settings["server"]+"/v1/slime/rewards"
        or not re.fullmatch(r"ticket=[A-Za-z0-9_-]{32,160}",parts.fragment)):
        raise ValueError("後端未提供可信的 Google 獎勵連結")
    if not webbrowser.open_new_tab(link):
        print("瀏覽器無法自動開啟領獎連結；請從可用的 Slime 網頁重新開啟。")
        return False
    print("已開啟 Google 獎勵領取頁（10 分鐘有效）。")
    return True


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
        if state.get("ok") is False:
            print("○ WeiGuo 明確拒絕節點心跳，請檢查節點授權。")
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
        if flags-{"--setup","--status","--leave","--reward","--gecko","--fleet","--tools","--help","--dashboard"} or len(flags)>1:
            raise ValueError("可用參數：--setup、--status、--leave、--reward、--gecko、--fleet、--tools")
        if "--help" in flags:
            print("Slime 下載 → 一次性邀請配對 → 授權後啟用 Ollama → Ctrl+C 停止共享")
            print("--status 查詢連線；--leave 退出並撤銷；--setup 顯示配對狀態")
            print("--reward 重新開啟 Google 節點獎勵領取頁")
            print("--gecko Owner 自願啟用同 LAN 安裝包鏡像和無 Telegram 配對")
            print("--fleet 由機房部署憑證將受管伺服器加入 Gecko，不輸入 Telegram 代碼")
            print("--tools 僅此 Owner 電腦開啟本機 AI 模型與沙盤管理介面")
            print("--dashboard 開啟桌面配對精靈／節點狀態／開始與停止共享")
            return 0
        # A local desktop function, never a remotely dispatched Slime task.
        # Permit opening the offline Owner toolbox without pairing.
        if "--tools" in flags:
            if _role() != "owner":
                raise ValueError("只有本機 Slime-Owner 才能開啟模型與沙盤工具")
            local_sources=(
                Path(__file__).resolve().parent/"slime_tools",
                Path(__file__).resolve().parents[1]/"slime",
            )
            for directory in local_sources:
                if directory.is_dir():
                    sys.path.insert(0,str(directory))
                    break
            try:
                from unified_tools_window import run_owner_tools
            except ImportError:
                raise ValueError("SLIME_OWNER_TOOLS_NOT_BUNDLED") from None
            return run_owner_tools()
        if "--dashboard" in flags or (not flags and getattr(sys,"frozen",False)):
            try:
                from slime_welcome import run_dashboard
                return run_dashboard()
            except (ImportError,RuntimeError) as exc:
                if "--dashboard" in flags or not sys.stdin.isatty():
                    print("桌面介面無法啟動，請確認系統有圖形桌面與 Tk 支援。",file=sys.stderr)
                    return 2
                print("圖形介面暫不可用，切換到原有文字操作模式。")
        config=_load()
        if "--reward" in flags and not config:
            print("請先完成 Slime 節點配對，才能領取 Google 獎勵。")
            return 2
        if "--leave" in flags:
            if config:leave(config)
            else: print("尚未配對。")
            return 0
        if "--fleet" in flags and not config:
            config=setup_fleet()
        elif not config or "--setup" in flags:
            first_pairing=config is None
            config=setup()
            if config and first_pairing:
                # A separate local success page is shown only after the real
                # backend pairing response has been validated and saved.
                # Never expose a device token or one-time invite in a URL/page.
                try:
                    from slime_success import open_success
                    open_success(config)
                except Exception:
                    # Browser availability never blocks the node's lifecycle.
                    print("節點已配對成功；此裝置目前無法開啟成功頁面。")
                try:
                    open_reward_claim(config)
                except Exception:
                    print("Google 獎勵目前無法開啟；配對仍已成功。稍後可使用 --reward 再試。")
        if not config:return 0
        if "--reward" in flags:
            try:
                open_reward_claim(config)
            except Exception:
                print("尚未能取得有效領獎連結；可能已領取、連結未到期或獎勵服務未啟用。")
                return 2
            return 0
        if "--status" in flags:
            return 0 if status(config) else 2
        if "--gecko" in flags:
            if config.get("role")!="owner":
                raise ValueError("僅已配對的 Slime Owner 電腦能分享 Gecko")
            if not _confirm("同意此電腦對同 LAN 提供 Gecko 安裝頁與 Friend 加入通道？"):
                print("未授權 Gecko；沒有開啟任何區域網路服務。")
                return 0
            mirror=_confirm("同意背景限速快取官方 Slime Friend 安裝包（約數十 MB）？")
            from gecko_lan import GeckoHost
            host=GeckoHost(config)
            host.start(mirror=mirror)
            print("✓ Gecko 已啟用 · 同一區域網路："+f"http://{host.ip}:41438")
            print("同網路使用者須親自開啟、下載、確認配對；不會強制安裝。")
            print("背景官方檔案鏡像限速，且同時間最多傳輸一份。")
            print("Ctrl+C 可停止 Gecko；停用後新的配對授權會立即作廢。")
            os.environ["VANILLA_SERVER_URL"]=config["server"]
            os.environ["SLIME_NODE_TOKEN"]=config["token"]
            os.environ["GECKO_FLEET_NODE"]="true" if config.get("gecko_fleet") else "false"
            os.environ["SLIME_ALLOW_POWER_OFF"]="1" if config.get("shutdown_opt_in") else "0"
            try:
                run_model()
            except KeyboardInterrupt:
                print("已停止 Gecko 及 Slime 共享。")
            finally:
                host.close()
            return 0
        print("啟動 Slime 節點："+config["label"])
        print("若需離線後恢復：本程式會自動重試連線，不需要重新輸入配對碼。")
        print("此電腦只會在你保持程式開啟、節點授權有效時回報／執行。")
        print("按 Ctrl+C 可隨時停止；永久退出請使用 --leave。")
        os.environ["VANILLA_SERVER_URL"]=config["server"]
        os.environ["SLIME_NODE_TOKEN"]=config["token"]
        os.environ["GECKO_FLEET_NODE"]="true" if config.get("gecko_fleet") else "false"
        os.environ["SLIME_ALLOW_POWER_OFF"]="1" if config.get("shutdown_opt_in") else "0"
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
