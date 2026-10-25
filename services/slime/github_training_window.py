"""Owner-only, read-only GitHub Actions training history browser."""
from __future__ import annotations
import threading
import tkinter as tk
from tkinter import ttk
import webbrowser

from github_training_status import get_public_training_runs

STATE={
 "queued":"排隊中","in_progress":"正在執行","waiting":"待核准",
 "requested":"已提出","pending":"待處理","completed":"已結束",
}
CONCLUSION={
 "success":"成功","failure":"失敗","cancelled":"取消",
 "skipped":"跳過","timed_out":"超時","neutral":"中性",
 "action_required":"需要操作","stale":"過期",None:"尚未完成",
}


def open_github_training_window(parent:tk.Misc,*,owner:bool)->None:
    if not owner:
        raise PermissionError("SLIME_GITHUB_TRAINING_MONITOR_OWNER_ONLY")
    window=tk.Toplevel(parent)
    window.title("SLIME · GitHub 真實訓練紀錄")
    window.geometry("930x610")
    window.minsize(770,510)
    body=ttk.Frame(window,padding=17)
    body.pack(fill="both",expand=True)
    ttk.Label(body,text="GitHub CPU／GPU 真實訓練紀錄",
              font=("Arial",17,"bold")).pack(anchor="w")
    ttk.Label(body,text="僅查詢公開 vanilla 工作流程。"
              "綠燈只代表 CI 執行結果，不代表 LoRA 權重已驗證或模型已部署。",
              wraplength=860).pack(anchor="w",pady=(5,10))
    status=tk.StringVar(value="尚未查詢；不會自行啟動 GPU 或外部運算費用。")
    table=ttk.Treeview(body,columns=("label","status","conclusion","date","commit"),
                      show="headings",height=12,selectmode="browse")
    for name,title,width in [
      ("label","訓練類型",330),("status","執行狀態",96),
      ("conclusion","GitHub 結論",98),("date","UTC 時間",190),
      ("commit","程式版本",120)]:
        table.heading(name,text=title)
        table.column(name,width=width,minwidth=70,stretch=name=="label")
    table.pack(fill="both",expand=True)
    detail=tk.Text(body,height=7,state="disabled",wrap="word")
    detail.pack(fill="x",pady=9)
    items={}
    busy=[False]
    def show_text(msg):
        detail.configure(state="normal")
        detail.delete("1.0","end")
        detail.insert("1.0",msg)
        detail.configure(state="disabled")
    def selected(event=None):
        selection=table.selection()
        if not selection:return
        item=items.get(selection[0])
        if not item:return
        show_text(
          f"{item['name']}\n"
          f"GitHub：{item['url']}\n"
          f"狀態：{STATE.get(item['status'],item['status'])} · "
          f"結論：{CONCLUSION.get(item['conclusion'],item['conclusion'])}\n"
          f"{item['evidence_message']}\n"
          "核對實際 safetensors 與 SHA-256 前，不能將此結果當成模型已訓練的證明。"
        )
    table.bind("<<TreeviewSelect>>",selected)
    def refresh():
        if busy[0]:return
        busy[0]=True
        status.set("正在只讀查詢 GitHub 公開訓練紀錄…")
        def worker():
            result=get_public_training_runs()
            def render():
                if not window.winfo_exists():return
                busy[0]=False
                for key in table.get_children():table.delete(key)
                items.clear()
                for row in result["rows"]:
                    key=str(row["id"]);items[key]=row
                    table.insert("",tk.END,iid=key,values=(
                        row["label"],STATE.get(row["status"],row["status"]),
                        CONCLUSION.get(row["conclusion"],"尚未完成"),
                        row["created_utc"].replace("+00:00","Z"),row["commit"]))
                if "error" in result:
                    status.set(result["error"])
                    show_text("未取得資料，不能推斷訓練成功或 GPU 狀態。")
                else:
                    status.set(f"已查到 {result['total_displayed']} 筆公開訓練紀錄。"
                               "不查私有 GPU Repo，不下載機密權重。")
                    if result["rows"]:
                        table.selection_set(str(result["rows"][0]["id"]))
                        selected()
                    else:
                        show_text("目前查無符合訓練清單的工作流程。")
            try:window.after(0,render)
            except tk.TclError:pass
        threading.Thread(target=worker,daemon=True).start()
    def open_selected():
        selected_rows=table.selection()
        if not selected_rows:return
        item=items.get(selected_rows[0])
        if item:
            # URL generated from fixed GitHub repo plus decimal numeric run ID.
            webbrowser.open_new_tab(item["url"])
    tools=ttk.Frame(body)
    tools.pack(fill="x",pady=8)
    ttk.Button(tools,text="更新 GitHub 工作流程",command=refresh).pack(side="left",padx=(0,8))
    ttk.Button(tools,text="在 GitHub 查看原始紀錄",command=open_selected).pack(side="left")
    ttk.Label(body,textvariable=status,wraplength=855).pack(fill="x",pady=5)
    ttk.Label(body,text="GPU：僅在私有 Runner 真正完成 CUDA optimizer、"
              "驗證 adapter SHA-256 與輸出回條後才能計入。"
              "公開倉庫目前沒有可由此畫面控制的 GPU Runner。",
              wraplength=855).pack(anchor="w")
    refresh()
