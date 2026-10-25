"""SLIME Owner-only local sandbox selector. No remote commands and no auto-execution."""
from __future__ import annotations
import json
import tkinter as tk
from tkinter import filedialog,messagebox,ttk
import threading
from sandbox_center import BY_ID,catalog,compile_plan,launch

def open_sandbox_window(parent,*,owner:bool,project_hint:str=""):
    if not owner:
        raise PermissionError("SLIME_SANDBOX_OWNER_ONLY")
    win=tk.Toplevel(parent)
    win.title("SLIME · 本機沙盤中心")
    win.geometry("790x680")
    win.minsize(640,560)
    container=ttk.Frame(win,padding=15)
    container.pack(fill="both",expand=True)
    ttk.Label(container,text="SLIME · 本機沙盤中心",font=("Arial",17,"bold")).pack(anchor="w")
    ttk.Label(container,text="統一管理已有沙盤：GPU／五維／圖書／論文／購物／語言權重預檢。"
              "只是工具入口，不會自動執行 100 萬次、下載全文或修改 Qwen 權重。",
              wraplength=735).pack(anchor="w",pady=(5,10))

    project=tk.StringVar(value=project_hint)
    source=tk.StringVar()
    paper_ids=tk.StringVar()
    model_size=tk.StringVar(value="1.7b")
    select=tk.StringVar(value="octuber-gpu-capacity")
    allow_heavy=tk.BooleanVar(value=False)
    allow_network=tk.BooleanVar(value=False)
    status=tk.StringVar(value="先選擇電腦上的 Vanilla 專案資料夾，按「沙盤盤點」。")
    active=[False]
    row=ttk.Frame(container)
    row.pack(fill="x",pady=3)
    ttk.Label(row,text="本機專案").pack(side="left")
    ttk.Entry(row,textvariable=project).pack(side="left",fill="x",expand=True,padx=5)
    def choose_repo():
        result=filedialog.askdirectory(parent=win)
        if result:
            project.set(result)
    ttk.Button(row,text="選取",command=choose_repo).pack(side="left")
    ttk.Label(container,text="選擇受支援的沙盤（尚未納管的腳本只會盤點、不允許直接執行）").pack(anchor="w",pady=(9,2))
    menu=ttk.Combobox(container,textvariable=select,state="readonly",
                      values=tuple(BY_ID))
    menu.pack(fill="x")

    listing=tk.Text(container,height=12,state="disabled",wrap="word")
    listing.pack(fill="both",expand=True,pady=8)
    def show(content):
        listing.configure(state="normal")
        listing.delete("1.0","end")
        listing.insert("1.0",content)
        listing.configure(state="disabled")
    def async_call(task,render):
        if active[0]:
            return
        active[0]=True
        status.set("在這台裝置上執行檢查，未使用遠端 SLIME 節點。")
        def worker():
            try:
                value=task()
                err=None
            except Exception as e:
                value=None
                err=str(e)
            def complete():
                if not win.winfo_exists():
                    return
                active[0]=False
                if err:
                    status.set("未完成："+err[:260])
                else:
                    status.set(render(value))
            try:win.after(0,complete)
            except tk.TclError:pass
        threading.Thread(target=worker,daemon=True).start()

    def scan():
        def done(result):
            lines=["支援已登記沙盤："+str(len(result["tasks"]))+
                   "；本機實際存在："+str(result["available_count"]),"",
                   "已納管沙盤："]
            for item in result["tasks"]:
                lines.append(("✓ " if item["available"] else "× ")+item["id"]+
                             "｜"+item["name"]+
                             "｜"+item["mode"]+
                             ("｜高負載" if item["large"] else "")+
                             ("｜可能連網" if item["network"] else ""))
            lines+=["","尚未設定安全執行參數的其他沙盤腳本："+
                   str(len(result["unregistered_sandbox_scripts"]))]
            lines+=["‧ "+r["script"]+"（僅盤點）"
                    for r in result["unregistered_sandbox_scripts"][:30]]
            show("\n".join(lines))
            return "已盤點本機沙盤，不代表已訓練或部署任何模型。"
        async_call(lambda:catalog(project.get()),done)

    settings=ttk.LabelFrame(container,text="自選輸入資料（只在這台電腦讀取；不自動收集）",padding=8)
    settings.pack(fill="x",pady=6)
    first=ttk.Frame(settings)
    first.pack(fill="x")
    ttk.Label(first,text="可選 CSV／SQLite").pack(side="left")
    ttk.Entry(first,textvariable=source).pack(side="left",fill="x",expand=True,padx=5)
    def choose_source():
        path=filedialog.askopenfilename(parent=win,
              filetypes=[("CSV 或 SQLite","*.csv *.sqlite3 *.sqlite *.db"),("所有檔案","*.*")])
        if path:
            source.set(path)
    ttk.Button(first,text="選取",command=choose_source).pack(side="left")
    second=ttk.Frame(settings)
    second.pack(fill="x",pady=4)
    ttk.Label(second,text="論文 arXiv IDs（逗號分隔）").pack(side="left")
    ttk.Entry(second,textvariable=paper_ids).pack(side="left",fill="x",expand=True,padx=5)
    ttk.Label(second,text="QLoRA 規格").pack(side="left")
    ttk.Combobox(second,textvariable=model_size,state="readonly",width=6,
                 values=("0.6b","1.7b","4b","8b","14b","30b","32b")).pack(side="left")
    ttk.Checkbutton(settings,text="我同意在本機執行高負載沙盤（可能達 100 萬／1,000 萬次）",
                    variable=allow_heavy).pack(anchor="w")
    ttk.Checkbutton(settings,text="我另外允許本次沙盤連線至腳本指定的公開資料來源",
                    variable=allow_network).pack(anchor="w")

    actions=ttk.Frame(container)
    actions.pack(fill="x",pady=7)
    ttk.Button(actions,text="沙盤盤點",command=scan).pack(side="left",padx=(0,8))
    def options():
        return {"input_path":source.get() or None,
                "arxiv_ids":paper_ids.get() or None,"model_size":model_size.get()}

    def preview():
        task=select.get()
        settings=options()
        def done(plan):
            clean={k:v for k,v in plan.items() if k!="task"}
            show(json.dumps({"task":plan["task"]["name"],**clean},ensure_ascii=False,indent=2))
            return "僅產生預覽；沒有啟動運算、下載或 GPU 微調。"
        async_call(lambda:compile_plan(project.get(),task,**settings),done)
    ttk.Button(actions,text="預覽單一任務",command=preview).pack(side="left",padx=(0,8))

    def start():
        if active[0]:
            return
        task=select.get()
        requested=BY_ID[task]
        if requested["large"] and not allow_heavy.get():
            status.set("未授權高負載沙盤；請先手動勾選同意。")
            return
        if requested["network"] and not allow_network.get():
            status.set("未授權連網沙盤；請先手動勾選同意。")
            return
        answer=messagebox.askyesno(
            "只在本機執行",
            "你要在這一台 SLIME Owner 電腦啟動：\n"+requested["name"]+
            "\n模式："+requested["mode"]+"\n權重作用範圍："+requested["weight_scope"]+
            "\n專案："+project.get()+
            "\n這不等於 Qwen 模型權重更新。不得拿沙盤結果當正式市場報價。"+
            "\n確定在本機執行嗎？",parent=win)
        if not answer:
            return
        settings=options()
        heavy=allow_heavy.get()
        network=allow_network.get()
        def done(result):
            show("本機任務已啟動（尚未確認完成）：\n"
                 +json.dumps(result,ensure_ascii=False,indent=2)+
                 "\n\n請到列出的目錄查看 output.log 與各腳本報告；"
                 "未有真實輸出前不得宣稱訓練完成。")
            return "任務已啟動；結果尚需完成後核對，並非語言權重已更新。"
        async_call(lambda:launch(project.get(),task,owner=True,confirmed=True,
                        heavy_approved=heavy,network_approved=network,**settings),done)
    ttk.Button(actions,text="本人確認後啟動本機沙盤",command=start).pack(side="left")
    ttk.Label(container,textvariable=status,wraplength=730).pack(fill="x",pady=(3,4))
    ttk.Label(container,text="所有工具只使用固定指令、固定腳本；Friend、Telegram 或遠端指令均無法啟動。",
              wraplength=735).pack(anchor="w")
