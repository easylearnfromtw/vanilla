"""Owner-only local finance QLoRA control; never accessible from Friend or web."""
from __future__ import annotations

import json
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from finance_training import TIERS, BLOCKED_60B, audit_finance, launch_finance


def open_finance_training_window(parent, *, owner: bool):
    if not owner:
        raise PermissionError("SLIME_FINANCE_OWNER_LOCAL_DESKTOP_ONLY")
    win = tk.Toplevel(parent)
    win.title("SLIME · OCTUBER 30 年全球金融訓練")
    win.geometry("830x760")
    win.minsize(710, 650)
    box = ttk.Frame(win, padding=16)
    box.pack(fill="both", expand=True)
    ttk.Label(box, text="OCTUBER × SLIME / FINANCE", font=("Arial", 18, "bold")).pack(anchor="w")
    ttk.Label(
        box, wraplength=780,
        text="20 大市場 × 1996–2026 時序研究。真實 QLoRA 需要已授權行情、逐筆核准的 JSONL、"
             "固定模型版本與本機 NVIDIA GPU。此視窗不會自行下載、遠端派工或認定訓練完成。"
    ).pack(anchor="w", pady=(5, 11))

    repo = tk.StringVar()
    data = tk.StringVar()
    output = tk.StringVar()
    tier = tk.StringVar(value="0.6b")
    revision = tk.StringVar()
    steps = tk.StringVar(value="180")
    allow_download = tk.BooleanVar(value=False)
    gpu_ok = tk.BooleanVar(value=False)
    rights_ok = tk.BooleanVar(value=False)
    license_ok = tk.BooleanVar(value=False)
    status = tk.StringVar(value="請選擇可信的 Vanilla 原始碼，以及私密金融資料根目錄。")
    running = [False]

    def field(label, var, *, choose=False, row=0, parent_frame=None):
        frame = parent_frame or box
        line = ttk.Frame(frame)
        line.pack(fill="x", pady=3)
        ttk.Label(line, text=label, width=24).pack(side="left")
        ttk.Entry(line, textvariable=var).pack(side="left", fill="x", expand=True, padx=5)
        if choose:
            def directory():
                path = filedialog.askdirectory(parent=win)
                if path:
                    var.set(path)
            ttk.Button(line, text="選擇", command=directory).pack(side="left")
        return line

    field("本機 Vanilla 專案", repo, choose=True)
    field("私人金融資料目錄", data, choose=True)
    field("訓練輸出位置（可留空）", output, choose=True)

    opts = ttk.Frame(box)
    opts.pack(fill="x", pady=5)
    ttk.Label(opts, text="金融模型尺寸").pack(side="left")
    ttk.Combobox(opts, textvariable=tier, values=tuple(TIERS),
                 state="readonly", width=9).pack(side="left", padx=8)
    ttk.Label(opts, text="更新步數（16–5000）").pack(side="left")
    ttk.Entry(opts, textvariable=steps, width=9).pack(side="left", padx=8)
    ttk.Label(opts, text="60B 暫不可執行").pack(side="left")

    field("基底模型 40 位 SHA", revision)

    acknowledgements = ttk.LabelFrame(box, text="逐項明確同意（僅此 Owner 電腦）", padding=8)
    acknowledgements.pack(fill="x", pady=7)
    ttk.Checkbutton(acknowledgements, text="我同意使用自己的 CUDA GPU 與電力進行本次微調",
                    variable=gpu_ok).pack(anchor="w")
    ttk.Checkbutton(acknowledgements, text="我已逐資料集核對金融行情與訓練教材的使用／模型訓練授權",
                    variable=rights_ok).pack(anchor="w")
    ttk.Checkbutton(acknowledgements, text="我已核對指定模型版本及其授權條款",
                    variable=license_ok).pack(anchor="w")
    ttk.Checkbutton(acknowledgements, text="本次允許下載模型權重（預設不允許，可能產生流量和空間占用）",
                    variable=allow_download).pack(anchor="w")

    result = tk.Text(box, height=14, wrap="word", state="disabled")
    result.pack(fill="both", expand=True, pady=5)

    def display(report):
        result.configure(state="normal")
        result.delete("1.0", "end")
        result.insert("1.0", json.dumps(report, ensure_ascii=False, indent=2))
        result.configure(state="disabled")

    def background(fn, render):
        if running[0]:
            return
        running[0] = True
        status.set("正在檢查此 Owner 電腦。此操作不會派工至 Slime Friend。")
        def worker():
            try:
                payload, error = fn(), None
            except Exception as exc:
                payload, error = None, str(exc)
            def finish():
                if not win.winfo_exists():
                    return
                running[0] = False
                if error:
                    status.set("未完成：" + error[:450])
                else:
                    display(payload)
                    status.set(render(payload))
            try:
                win.after(0, finish)
            except tk.TclError:
                pass
        threading.Thread(target=worker, daemon=True).start()

    def inputs():
        return repo.get(), data.get(), tier.get(), revision.get()

    def audit():
        def render(row):
            if row["status"] == "preflight-eligible-untrained":
                return "本機條件符合初步門檻；尚未更新權重，仍須人工核准與獨立盲測。"
            return "未達 GPU 訓練條件（CUDA／可用顯存）；沒有更新模型。"
        background(lambda: audit_finance(*inputs()), render)

    def start():
        if running[0]:
            return
        if not all((gpu_ok.get(), rights_ok.get(), license_ok.get())):
            status.set("需分別確認 GPU 費用、資料使用權與基底模型授權。")
            return
        try:
            count = int(steps.get())
        except ValueError:
            status.set("訓練步數必須是整數。")
            return
        if not 16 <= count <= 5000:
            status.set("訓練步數僅允許 16–5000。")
            return
        if not messagebox.askyesno(
            "OCTUBER 金融模型微調：最後確認",
            "將在此 SLIME Owner 電腦啟動一個真實 QLoRA 訓練程序。\n"
            "模型：" + tier.get() + "；步數：" + str(count) + "\n"
            "資料：" + data.get() + "\n"
            "已核對資料授權與模型授權，CUDA/電力成本由此電腦承擔。\n"
            "不會經 Telegram 遠端派工、下載未核准新聞、或自動部署。\n"
            "確定啟動嗎？", parent=win
        ):
            return
        opts = inputs()
        out = output.get() or None
        fetch = allow_download.get()
        background(
            lambda: launch_finance(*opts, owner=True, confirmed=True,
                                   gpu_approved=True, rights_approved=True,
                                   license_approved=True, allow_download=fetch,
                                   output_root=out, steps=count),
            lambda row: "已啟動本機訓練程序；僅表示進程已建立，請依日誌與獨立測試驗證。"
        )

    buttons = ttk.Frame(box)
    buttons.pack(fill="x", pady=8)
    ttk.Button(buttons, text="檢查 20 大市場與 GPU 前置條件", command=audit).pack(side="left", padx=(0, 8))
    ttk.Button(buttons, text="本人授權後啟動金融 QLoRA", command=start).pack(side="left")
    ttk.Label(box, textvariable=status, wraplength=785).pack(anchor="w", pady=6)
    ttk.Label(
        box, wraplength=785,
        text="重要：此功能沒有自動購買 GPU、下載付費行情、訓練 Friend 模型、合併權重或正式發佈。"
             "僅讀取手動選定的本機資料；60B 因相容性未驗證而封鎖。"
    ).pack(anchor="w")
