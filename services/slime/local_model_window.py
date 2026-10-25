"""Slime Owner's explicitly local AI model tools window. Never available to Friends."""
from __future__ import annotations

import json
from pathlib import Path
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from local_model_tools import (
    MODEL_SIZES, local_inventory, verify_local_inference, audit_training,
    launch_owner_training
)
from training_evidence import inspect_local_lora, inspect_sandbox_report


def open_local_model_window(parent: tk.Tk, *, owner: bool) -> None:
    if not owner:
        raise PermissionError("SLIME_OWNER_ONLY_LOCAL_AI_TOOL")
    win = tk.Toplevel(parent)
    win.title("Slime · 本機 AI 模型與 LoRA")
    win.geometry("745x640")
    win.minsize(660, 570)
    main = ttk.Frame(win, padding=15)
    main.pack(fill="both", expand=True)
    ttk.Label(main, text="SLIME ／ 本機 AI 模型管理",
              font=("Arial", 17, "bold")).pack(anchor="w")
    ttk.Label(main, text="僅此電腦 Owner 操作。不透過 WeiGuo、Telegram 或 SLIME Friend 遠端下指令。",
              wraplength=670).pack(anchor="w", pady=(4, 12))

    size = tk.StringVar(value="1.7b")
    project = tk.StringVar()
    data = tk.StringVar()
    revision = tk.StringVar()
    allow_download = tk.BooleanVar(value=False)
    status = tk.StringVar(value="先掃描本機 Ollama；安裝 ≠ 真正推論 ≠ 已訓練。")
    active = [False]

    ttk.Label(main, text="選擇規格").pack(anchor="w")
    ttk.Combobox(main, textvariable=size, state="readonly",
                 values=[x[0] for x in MODEL_SIZES]).pack(fill="x", pady=(3, 8))
    text = tk.Text(main, height=11, wrap="word", state="disabled")
    text.pack(fill="both", expand=True)

    def display(value: str) -> None:
        text.configure(state="normal")
        text.delete("1.0", "end")
        text.insert("1.0", value)
        text.configure(state="disabled")

    def background(task, render) -> None:
        if active[0]:
            return
        active[0] = True
        status.set("本機操作中，沒有遠端控制或自動下載其他模型。")
        def worker():
            try:
                value = task()
                error = None
            except Exception as exc:
                value, error = None, str(exc)
            def done():
                if not win.winfo_exists():
                    return
                active[0] = False
                if error:
                    status.set("未完成：" + error[:240])
                else:
                    status.set(render(value))
            try:
                win.after(0, done)
            except tk.TclError:
                pass
        threading.Thread(target=worker, daemon=True).start()

    controls = ttk.Frame(main)
    controls.pack(fill="x", pady=8)
    def inventory_view():
        def done(report):
            display("\n".join(
                f"{item['size']:>4} · {item['ollama']:<14} · " +
                ("本機已安裝（待測試）" if item["installed"] else "未安裝") +
                f" · QLoRA 顯存參考 {item['qlora_vram_guide_gib']} GiB"
                for item in report["models"]
            ))
            return ("已取得本機 Ollama 清單，仍須實測生成。" if report["ollama_running"]
                    else "Ollama 未啟動或無法連到 127.0.0.1:11434。")
        background(local_inventory, done)

    def inference_view():
        requested = size.get()
        def done(result):
            display("Qwen3 " + requested + "：" + result["reason"] +
                    "\n" + ("實際推論已驗證，但不代表權重微調完成。"
                            if result["inference_verified"]
                            else "未通過實際推論，不能標為可用。"))
            return "本機模型生成測試已執行。"
        background(lambda: verify_local_inference(requested), done)

    ttk.Button(controls, text="掃描本機模型", command=inventory_view).pack(side="left", padx=(0, 8))
    ttk.Button(controls, text="實際生成測試", command=inference_view).pack(side="left")

    frame = ttk.LabelFrame(main, text="本機 QLoRA 權重訓練（需 CUDA、已審核資料）", padding=8)
    frame.pack(fill="x", pady=6)
    def choose_project():
        chosen = filedialog.askdirectory(parent=win)
        if chosen:
            project.set(chosen)
    def choose_data():
        chosen = filedialog.askopenfilename(parent=win, filetypes=[("JSONL", "*.jsonl")])
        if chosen:
            data.set(chosen)
    for i, (label, var, chooser) in enumerate([
        ("Vanilla 專案路徑", project, choose_project),
        ("審核後教材 JSONL", data, choose_data),
    ]):
        ttk.Label(frame, text=label).grid(row=i, column=0, sticky="w", pady=3)
        ttk.Entry(frame, textvariable=var, width=42).grid(row=i, column=1, sticky="ew", padx=4)
        ttk.Button(frame, text="選取", command=chooser).grid(row=i, column=2)
    ttk.Label(frame, text="基底模型 40 位 commit SHA").grid(row=2, column=0, sticky="w")
    ttk.Entry(frame, textvariable=revision).grid(row=2, column=1, columnspan=2, sticky="ew", pady=3)
    ttk.Checkbutton(frame, text="允許下載官方權重（預設關閉；可能需要大量磁碟）",
                    variable=allow_download).grid(row=3, column=0, columnspan=3, sticky="w")
    frame.columnconfigure(1, weight=1)

    def args():
        return project.get(), data.get(), size.get(), revision.get()

    def audit_view():
        requested = args()
        def done(result):
            display("\n".join(("✓ " if item["ready"] else "× ") +
                 item["requirement"] + " · " + item["detail"]
                 for item in result["checks"]))
            return ("訓練條件已達檢查門檻；尚未執行。"
                    if result["status"] == "preflight-eligible-untrained"
                    else "CUDA／基底權重／合法資料或固定版本不足，不允許訓練。")
        permitted_download = allow_download.get()
        background(lambda: audit_training(*requested, allow_download=permitted_download), done)

    def train_view():
        if active[0]:
            return
        requested = args()
        if not messagebox.askyesno(
            "只允許此 Owner 電腦訓練",
            "你即將在自己的電腦啟動 Qwen3 " + size.get() +
            " QLoRA 微調。\n" +
            "專案：" + project.get() + "\n教材：" + data.get() +
            "\n將使用本機 CUDA，可能耗費大量顯存／電力。\n"
            "不會由 Slime 遠端派工給其他人的節點。確定啟動？",
            parent=win
        ):
            return
        permitted_download = allow_download.get()
        def done(result):
            display("本機訓練程序已啟動，尚未完成權重驗證。\n"
                    "PID：" + str(result["pid"]) +
                    "\n訓練紀錄：" + result["log_path"] +
                    "\n輸出：" + result["output"] +
                    "\n完成後必須檢查 adapter_model.safetensors 及 training-provenance.json。")
            return "已啟動本機訓練，不代表已完成。"
        background(lambda: launch_owner_training(
            *requested, owner=True, confirmed=True, allow_download=permitted_download
        ), done)

    buttons = ttk.Frame(main)
    buttons.pack(fill="x", pady=7)
    ttk.Button(buttons, text="檢查訓練條件", command=audit_view).pack(side="left", padx=(0, 8))
    ttk.Button(buttons, text="本人確認後啟動 QLoRA", command=train_view).pack(side="left")
    def verify_saved_checkpoint():
        selected = filedialog.askdirectory(
            parent=win, title="選擇訓練輸出資料夾（含 adapter/ 與 training-provenance.json）"
        )
        if not selected:
            return
        def finished(result):
            display(json.dumps(result, ensure_ascii=False, indent=2))
            return "已驗證本機 adapter 檔案和訓練回條相符；尚未獨立證明訓練來源，也沒有部署。"
        background(lambda: inspect_local_lora(selected), finished)

    def verify_sandbox_receipt():
        selected = filedialog.askopenfilename(
            parent=win, title="選擇 SLIME 沙盤測試回條",
            filetypes=[("JSON", "*.json")]
        )
        if not selected:
            return
        def finished(result):
            display(json.dumps(result, ensure_ascii=False, indent=2))
            return "這是沙盤測試回條，不是 Qwen 語言權重更新。"
        background(lambda: inspect_sandbox_report(selected), finished)

    verify_controls = ttk.Frame(main)
    verify_controls.pack(fill="x", pady=(2, 3))
    ttk.Button(verify_controls, text="驗證本機 LoRA 權重與 SHA-256",
               command=verify_saved_checkpoint).pack(side="left", padx=(0, 8))
    ttk.Button(verify_controls, text="檢視沙盤執行回條",
               command=verify_sandbox_receipt).pack(side="left")
    ttk.Label(main, textvariable=status, wraplength=685).pack(anchor="w", pady=6)
    ttk.Label(main, text="Slime Friend 無權啟動此工具；無新權重時維持原本模型。"
              "程序啟動後需查看本機日誌及獨立測試結果。",
              wraplength=685).pack(anchor="w")
