"""First-run SLIME desktop dashboard: pairing, honest readiness and stop control.

This is a local Tk interface only. No remote shell, hidden model downloads,
automatic reward redirects or credential storage beyond existing owner/friend.json.
"""
from __future__ import annotations

import platform
import threading
import tkinter as tk
from tkinter import messagebox, ttk
from urllib.error import HTTPError, URLError
import webbrowser

GUIDE_URL = "https://easylearnfromtw.github.io/vanilla/slime/"


def explain_failure(error):
    """Actionable guidance with no bearer tokens, invite text or response bodies."""
    if isinstance(error, HTTPError):
        if error.code in (401, 403):
            return "配對碼無效、已使用或已逾期。請在 Telegram Ceres /hub 重新取得一次性配對碼。"
        if error.code == 404:
            return "目前後端沒有配對服務。請檢查所選 WeiGuo 伺服器網址或部署版本。"
        if error.code == 429:
            return "請求次數過多。請稍後再試，勿連續重送配對碼。"
        if error.code in (500, 502, 503, 504):
            return "WeiGuo 服務暫時不可用。保留目前畫面，稍後重新檢查網路或服務狀態。"
        return "伺服器拒絕連線（HTTP " + str(error.code) + "），請核對網址與配對授權。"
    if isinstance(error, (TimeoutError, URLError, ConnectionError)):
        return "無法連接 WeiGuo HTTPS。確認網路、防火牆／代理與電腦時間後重試。"
    if isinstance(error, PermissionError):
        return "裝置權限不符。Owner／Friend 必須安裝各自的版本，不能交換權限。"
    if isinstance(error, ValueError):
        # Never display exception text: input or upstream exceptions can contain secrets.
        return "輸入格式或本機設定未通過驗證。請檢查裝置名稱、12 位配對碼與 HTTPS 網址。"
    return "這項操作尚未完成。請重新開啟程式或查看本機網路狀態。"


class Dashboard:
    def __init__(self, desktop):
        self.desktop = desktop
        self.role = desktop._role()
        self.settings = None
        self.settings_error = False
        try:
            self.settings = desktop._load()
        except ValueError:
            # Never silently replace a corrupted credential; user must revoke first.
            self.settings_error = True
        self.root = tk.Tk()
        self.root.title("SLIME · " + ("Owner" if self.role == "owner" else "Friend"))
        self.root.geometry("760x695")
        self.root.minsize(600, 580)
        self.root.configure(background="#F6F8FC")
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.busy = False
        self.running = False
        self.stop_event = None
        self.runner_thread = None
        self.message = tk.StringVar(value="準備完成。此電腦尚未啟動任何模型共享。")
        self._style()
        self._draw()

    def _style(self):
        styles = ttk.Style(self.root)
        if "clam" in styles.theme_names():
            styles.theme_use("clam")
        styles.configure("Main.TFrame", background="#F6F8FC")
        styles.configure("Paper.TFrame", background="#FFFFFF")
        styles.configure("Main.TLabel", background="#F6F8FC", foreground="#192239")
        styles.configure("Paper.TLabel", background="#FFFFFF", foreground="#192239")
        styles.configure("Muted.TLabel", background="#FFFFFF", foreground="#586780")
        styles.configure("Primary.TButton", padding=(16, 11), font=("Arial", 11, "bold"))
        styles.configure("Action.TButton", padding=(11, 8))
        styles.configure("Paper.TCheckbutton", background="#FFFFFF", foreground="#283448")
        styles.configure("Paper.TEntry", padding=(8, 6))
        styles.configure("Paper.TLabelframe", background="#FFFFFF")
        styles.configure("Paper.TLabelframe.Label", background="#FFFFFF")
        styles.map("Primary.TButton", background=[("active", "#DDE7FF")])

    def _add(self, label, value, parent, *, hide=None):
        ttk.Label(parent, text=label, style="Paper.TLabel").pack(anchor="w", pady=(11, 4))
        entry = ttk.Entry(parent, textvariable=value, style="Paper.TEntry", show=hide)
        entry.pack(fill="x", ipady=4)
        return entry

    def _reset(self):
        for child in self.root.winfo_children():
            child.destroy()
        self._draw()

    def _draw(self):
        panel = ttk.Frame(self.root, style="Main.TFrame", padding=(25, 20))
        panel.pack(fill="both", expand=True)
        title = "SLIME  /  " + ("OWNER" if self.role == "owner" else "FRIEND")
        ttk.Label(panel, text=title, style="Main.TLabel",
                  font=("Arial", 24, "bold")).pack(anchor="w")
        ttk.Label(panel, text="本機算力節點 · 只有你同意並保持程式運行才會連線",
                  style="Main.TLabel").pack(anchor="w", pady=(4, 15))
        card = ttk.Frame(panel, style="Paper.TFrame", padding=19)
        card.pack(fill="both", expand=True)
        if self.settings_error:
            ttk.Label(card, text="本機配對設定需要人工確認", style="Paper.TLabel",
                      font=("Arial", 16, "bold")).pack(anchor="w")
            ttk.Label(card, text="既有裝置憑證資料可能損壞。為避免同一節點殘留有效授權，"
                      "請先備份 ~/.vanilla/slime/ 下對應的 owner.json 或 friend.json，"
                      "在 Telegram Ceres Owner 撤銷舊節點後，再移走損壞的本機設定重新配對。",
                      style="Muted.TLabel", wraplength=605).pack(anchor="w", pady=12)
            ttk.Button(card, text="查看配對與安全說明", command=self.help).pack(anchor="w")
        elif self.settings:
            self._paired(card)
        else:
            self._unpaired(card)
        ttk.Label(panel, textvariable=self.message, style="Main.TLabel",
                  wraplength=680).pack(anchor="w", pady=(15, 0))
        footer = "離開此視窗會停止本次共享；解除裝置綁定必須另外按「退出並撤銷配對」。"
        ttk.Label(panel, text=footer, style="Main.TLabel",
                  wraplength=680).pack(anchor="w", pady=(8, 0))

    def _unpaired(self, card):
        ttk.Label(card, text="① 第一次使用 · 連結你的電腦", style="Paper.TLabel",
                  font=("Arial", 16, "bold")).pack(anchor="w")
        ttk.Label(card, text="1. 開啟 Telegram Ceres /hub → Slime → 取得 10 分鐘配對碼\n"
                  "2. 為這台電腦取名並貼上短碼\n"
                  "3. 閱讀授權後按下「安全配對」；成功後再自行啟動共享",
                  style="Muted.TLabel", wraplength=620).pack(anchor="w", pady=(8, 4))
        self.label = tk.StringVar(value=platform.node()[:48] or "我的電腦")
        self.code = tk.StringVar()
        self.server = tk.StringVar(value=self.desktop.DEFAULT_SERVER)
        self.consent = tk.BooleanVar(value=False)
        self.geo = tk.BooleanVar(value=False)
        self.power = tk.BooleanVar(value=False)
        self.advanced = tk.BooleanVar(value=False)
        self.reveal = tk.BooleanVar(value=False)
        self._add("這台電腦的名稱", self.label, card)
        line = ttk.Frame(card, style="Paper.TFrame")
        line.pack(fill="x")
        code_entry = self._add("Telegram 一次性配對碼", self.code, line, hide="•")
        def toggle_reveal():
            code_entry.configure(show="" if self.reveal.get() else "•")
        ttk.Checkbutton(card, text="顯示配對碼（避免旁人看到請勿勾選）",
                        variable=self.reveal, command=toggle_reveal,
                        style="Paper.TCheckbutton").pack(anchor="w", pady=(5, 0))
        ttk.Checkbutton(card, text="進階：自行指定可信 WeiGuo HTTPS 伺服器",
                        variable=self.advanced, command=lambda: self._server_toggle(card),
                        style="Paper.TCheckbutton").pack(anchor="w", pady=(9, 0))
        self.server_entry = None
        self.server_frame = ttk.Frame(card, style="Paper.TFrame")
        self.server_frame.pack(fill="x")
        ttk.Checkbutton(card, text="自願分享公開 IP／約略城市（預設關閉）",
                        variable=self.geo, style="Paper.TCheckbutton").pack(anchor="w", pady=(8, 0))
        ttk.Checkbutton(card, text="允許 Owner 二次核准關機（預設關閉）",
                        variable=self.power, style="Paper.TCheckbutton").pack(anchor="w", pady=(3, 0))
        ttk.Checkbutton(card, text="我同意加入 SLIME 並回報硬體狀態；推論另需 Owner 核准",
                        variable=self.consent, style="Paper.TCheckbutton").pack(anchor="w", pady=(8, 7))
        buttons = ttk.Frame(card, style="Paper.TFrame")
        buttons.pack(fill="x", pady=(5, 0))
        self.pair_button = ttk.Button(buttons, text="安全配對 →", style="Primary.TButton",
                                      command=self.pair)
        self.pair_button.pack(side="left", padx=(0, 10))
        ttk.Button(buttons, text="沒有配對碼？", command=self.help,
                   style="Action.TButton").pack(side="left")

    def _server_toggle(self, _parent):
        if self.advanced.get():
            if self.server_entry is None:
                self.server_entry = self._add("進階 HTTPS 伺服器網址", self.server, self.server_frame)
            self.server_entry.focus_set()
        elif self.server_entry is not None:
            for child in self.server_frame.winfo_children():
                child.destroy()
            self.server_entry = None
            self.server.set(self.desktop.DEFAULT_SERVER)

    def _paired(self, card):
        name = self.settings.get("label", "此電腦")
        ttk.Label(card, text="② 已綁定 · " + name, style="Paper.TLabel",
                  font=("Arial", 17, "bold")).pack(anchor="w")
        ttk.Label(card, text="裝置憑證已保存在本機；無須再次取得配對碼。"
                  "請先檢查連線狀態，再選擇是否開始共享。",
                  style="Muted.TLabel", wraplength=620).pack(anchor="w", pady=(9, 15))
        self.connection = tk.StringVar(value="未檢查（不代表離線）")
        self.inference = tk.StringVar(value="尚未向 Owner 後端確認")
        self.model = tk.StringVar(value="尚未測試；安裝 Ollama 並非配對的必要條件")
        self.service = tk.StringVar(value="已停止；目前沒有共享本機模型")
        for label, var in (("連線狀態", self.connection), ("推論授權", self.inference),
                           ("本機 Ollama", self.model), ("分享服務", self.service)):
            ttk.Label(card, text=label, style="Muted.TLabel").pack(anchor="w", pady=(9, 1))
            ttk.Label(card, textvariable=var, style="Paper.TLabel",
                      wraplength=600, font=("Arial", 11, "bold")).pack(anchor="w")
        row = ttk.Frame(card, style="Paper.TFrame")
        row.pack(fill="x", pady=(20, 8))
        ttk.Button(row, text="檢查網路與 Ollama", command=self.refresh,
                   style="Action.TButton").pack(side="left", padx=(0, 8))
        self.start_button = ttk.Button(row, text="開始共享", command=self.start,
                                       style="Primary.TButton")
        self.start_button.pack(side="left", padx=(0, 8))
        self.stop_button = ttk.Button(row, text="停止共享", command=self.stop,
                                      style="Action.TButton", state="disabled")
        self.stop_button.pack(side="left")
        row2 = ttk.Frame(card, style="Paper.TFrame")
        row2.pack(fill="x", pady=(3, 8))
        if self.role == "owner":
            ttk.Button(row2, text="我的 AI／沙盤／OCTUBER 工具", command=self.tools,
                       style="Action.TButton").pack(side="left", padx=(0, 8))
        ttk.Button(row2, text="領取節點獎勵（手動）", command=self.reward,
                   style="Action.TButton").pack(side="left", padx=(0, 8))
        ttk.Button(row2, text="退出並撤銷配對", command=self.leave,
                   style="Action.TButton").pack(side="left")
        ttk.Label(card, text="節點在線 ≠ 模型可用：必須另外安裝 Ollama 本機模型，"
                  "並由 Telegram Owner 開啟推論授權。沒有模型時仍可以保持節點在線。",
                  style="Muted.TLabel", wraplength=620).pack(anchor="w", pady=(15, 0))

    def _async(self, work, on_success, *, indicator="正在檢查…"):
        if self.busy:
            return
        self.busy = True
        self.message.set(indicator)
        def execute():
            try:
                answer = work()
                failure = None
            except Exception as exc:
                answer, failure = None, explain_failure(exc)
            def finish():
                if not self.root.winfo_exists():
                    return
                self.busy = False
                if failure:
                    self.message.set(failure)
                else:
                    on_success(answer)
            try:
                self.root.after(0, finish)
            except (tk.TclError, RuntimeError):
                pass
        threading.Thread(target=execute, daemon=True).start()

    def pair(self):
        if self.busy or self.settings or not self.consent.get():
            self.message.set("請先閱讀並勾選節點授權同意，且確認尚未配對。")
            return
        label = self.label.get().strip()
        code = self.code.get().strip()
        server = self.server.get().strip()
        if not label or not code:
            self.message.set("請填入裝置名稱，以及 Telegram Ceres 提供的一次性配對碼。")
            return
        if not self.advanced.get():
            server = self.desktop.DEFAULT_SERVER
        # Capture only ephemeral values for this single user-authorized request.
        geo, power = self.geo.get(), self.power.get()
        self.pair_button.configure(state="disabled")
        def work():
            # Validate the code/HTTPS first; an invalid code never triggers IP lookup.
            self.desktop._invite(code)
            self.desktop._server(server)
            external_ip = self.desktop._public_ip() if geo else ""
            return self.desktop.pair_with_consent(
                server=server, label=label, secret=code, consent=True,
                role=self.role, geo_opt_in=geo, shutdown_opt_in=power,
                public_ip=external_ip)
        def done(result):
            self.settings, verified = result
            self.code.set("")
            self.message.set("配對完成" + ("，首次心跳成功。" if verified
                                          else "；首次心跳尚未確認，可按檢查連線重試。"))
            self._reset()
        # Button is rebuilt on success, restored on failure.
        def on_fail_safe():
            self.pair_button.configure(state="normal")
        def wrapped():
            try:
                return work()
            except Exception:
                self.root.after(0, on_fail_safe)
                raise
        self._async(wrapped, done, indicator="正在向 WeiGuo 驗證配對碼；請勿重複提交。")

    def refresh(self):
        if self.busy or not self.settings:
            return
        settings = dict(self.settings)
        def work():
            from slime_runner_agent import _heartbeat, _models
            state = _heartbeat(settings["server"], settings["token"])
            if not isinstance(state, dict) or state.get("ok") is not True:
                raise ConnectionError("HEARTBEAT_NOT_CONFIRMED")
            try:
                models = _models()
                local = "本機模型：" + (", ".join(models[:4]) if models else "無已安裝模型")
            except (HTTPError, URLError, OSError, TimeoutError, ValueError, TypeError):
                local = "Ollama 尚未連線；不影響節點綁定"
            return state, local
        def done(answer):
            state, local = answer
            self.connection.set("已確認 · WeiGuo 心跳正常")
            self.inference.set("Owner 已核准推論" if state.get("inference_enabled")
                               else "待 Owner 核准；目前不接收推論工作")
            self.model.set(local)
            self.message.set("診斷完成：綁定、推論授權與模型安裝狀態已分開檢查。")
        self._async(work, done, indicator="正在分別驗證雲端心跳及本機 Ollama…")

    def start(self):
        if not self.settings or self.running or self.busy:
            return
        if not messagebox.askyesno(
            "開始共享這台電腦？",
            "SLIME 會定期回報基本硬體資訊；若 Telegram Owner 已授權推論，"
            "可能在本機 Ollama 處理傳來的提示內容。\n"
            "不會執行遠端 Shell，也不會自動下載模型。關閉視窗或按「停止共享」即結束。",
            parent=self.root):
            return
        settings = dict(self.settings)
        self.stop_event = threading.Event()
        self.running = True
        self.start_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self.service.set("啟動中 · 背景 HTTPS 心跳輪詢")
        self.message.set("共享已啟動（不代表 Ollama 已可推論）；按停止即可結束。")
        def worker():
            try:
                from slime_runner_agent import run
                run(server=settings["server"], token=settings["token"],
                    stop_event=self.stop_event,
                    allow_power_off=settings.get("shutdown_opt_in") is True)
                note = "共享已停止。"
            except Exception as exc:
                note = "共享程序中斷：" + explain_failure(exc)
            def complete():
                if not self.root.winfo_exists():
                    return
                self.running = False
                self.service.set("已停止 · 本機不再輪詢")
                self.start_button.configure(state="normal")
                self.stop_button.configure(state="disabled")
                self.message.set(note)
            try:
                self.root.after(0, complete)
            except (tk.TclError, RuntimeError):
                pass
        self.runner_thread = threading.Thread(target=worker, daemon=True,
                                              name="SlimeDesktopOptInRunner")
        self.runner_thread.start()

    def stop(self):
        if self.stop_event:
            self.stop_event.set()
            self.service.set("停止中 · 不會接收新的工作")
            self.message.set("正在結束共享；現有 HTTPS 請求完成後即停止。")
            self.stop_button.configure(state="disabled")

    def tools(self):
        if self.role != "owner":
            raise PermissionError("只有 Owner 可開啟本機 AI 工具")
        from pathlib import Path
        import sys
        root = Path(self.desktop.__file__).resolve()
        for directory in (root.parent / "slime_tools", root.parents[1] / "slime"):
            if directory.is_dir():
                sys.path.insert(0, str(directory))
                break
        try:
            from unified_tools_window import run_owner_tools
            run_owner_tools(self.root)
        except (ImportError, OSError, ValueError):
            self.message.set("這個安裝包沒有完整 Owner 工具，請重新下載官方 Owner 版本。")

    def reward(self):
        if not self.settings or self.busy:
            return
        self._async(lambda: self.desktop.open_reward_claim(self.settings),
                    lambda result: self.message.set(
                        "已開啟可驗證的節點獎勵頁。" if result else
                        "未能開啟獎勵頁，稍後可手動重試。"),
                    indicator="正在向後端取得一次性領獎頁…")

    def leave(self):
        if not self.settings or self.running or self.busy:
            self.message.set("請先停止共享，確認狀態為「已停止」後再解除配對。")
            return
        if not messagebox.askyesno("永久解除配對",
                                   "此操作會通知伺服器撤銷這台電腦的裝置授權，"
                                   "成功後才刪除本機憑證；無法撤銷時會保留設定。確定嗎？",
                                   parent=self.root):
            return
        current = dict(self.settings)
        def work():
            self.desktop._http(
                "POST", current["server"] + "/v1/slime/node/leave",
                authorization=current["token"], timeout=12)
            self.desktop._settings_path().unlink(missing_ok=True)
            return True
        def done(_):
            self.settings = None
            self.message.set("解除配對完成；必須重新取得一次性配對碼才能再次連線。")
            self._reset()
        self._async(work, done, indicator="正在向後端撤銷裝置授權…")

    def help(self):
        webbrowser.open_new_tab(GUIDE_URL)

    def close(self):
        if self.running:
            if not messagebox.askyesno("停止共享並關閉？",
                                       "關閉 SLIME 將停止本次節點共享。"
                                       "裝置配對仍會保留，下次不必重新取得配對碼。",
                                       parent=self.root):
                return
            if self.stop_event:
                self.stop_event.set()
        self.root.destroy()


def run_dashboard():
    # Import inside UI entry only; legacy CLI works without a graphical desktop.
    import slime_desktop
    app = Dashboard(slime_desktop)
    # The frozen Windows executable uses --console for legacy --status/--leave.
    # Hide its console only when the real graphical dashboard is open.
    import sys
    if sys.platform == "win32" and getattr(sys, "frozen", False):
        try:
            import ctypes
            handle = ctypes.windll.kernel32.GetConsoleWindow()
            if handle:
                ctypes.windll.user32.ShowWindow(handle, 0)
        except (AttributeError, OSError):
            pass
    app.root.mainloop()
    return 0
