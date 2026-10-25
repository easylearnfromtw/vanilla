"""Locally launched tools menu; independent of pairing and networking."""
from __future__ import annotations
import tkinter as tk
from tkinter import ttk
from local_model_window import open_local_model_window
from sandbox_window import open_sandbox_window

def run_owner_tools()->int:
    main=tk.Tk()
    main.title("SLIME Owner · 本機工具")
    main.geometry("580x295")
    main.minsize(515,260)
    container=ttk.Frame(main,padding=23)
    container.pack(fill="both",expand=True)
    ttk.Label(container,text="SLIME · Owner 本機工具",
              font=("Arial",19,"bold")).pack(anchor="w",pady=8)
    ttk.Label(container,text="本機模型、QLoRA 和已存在的研究沙盤統一管理。\n"
              "只有在這台電腦親自確認後才執行；不開啟遠端指令權限。",
              wraplength=515).pack(anchor="w",pady=(5,15))
    ttk.Button(container,text="本機模型管理／QLoRA 權重訓練",
               command=lambda:open_local_model_window(main,owner=True)).pack(fill="x",pady=4)
    ttk.Button(container,text="沙盤中心／批次實驗與輸出紀錄",
               command=lambda:open_sandbox_window(main,owner=True)).pack(fill="x",pady=4)
    ttk.Label(container,text="Friend 版與未經 Owner 確認的遠端工作均無權啟動。",
              wraplength=515).pack(anchor="w",pady=8)
    main.mainloop()
    return 0
