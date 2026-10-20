"""Medusa Lite: bounded AST interpreter, NOT a general Python sandbox.

No eval/exec, user bytecode, arbitrary functions, imports, attribute access,
filesystem, networking or subprocess execution. Only documented Python subset.
"""
from __future__ import annotations
import ast
import asyncio
import math
import os
import time

from fastapi import HTTPException

ALLOWED = (
    ast.Module, ast.Expr, ast.Assign, ast.AugAssign, ast.If, ast.For, ast.Pass,
    ast.Constant, ast.Name, ast.Load, ast.Store, ast.BinOp, ast.UnaryOp,
    ast.BoolOp, ast.Compare, ast.Call, ast.List, ast.Tuple, ast.Subscript,
    ast.IfExp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod,
    ast.Pow, ast.UAdd, ast.USub, ast.Not, ast.And, ast.Or, ast.Eq, ast.NotEq,
    ast.Lt, ast.LtE, ast.Gt, ast.GtE,
)
FUNCTIONS = frozenset(("print", "range", "sum", "len", "min", "max", "abs",
                       "round", "int", "float", "str", "bool", "input"))
MAX_STEPS = 5000
MAX_ITERATIONS = 256
MAX_OUTPUT = 4096
MAX_TEXT = 2048
MAX_ABS_NUMBER = 10 ** 12


class LiteError(Exception):
    """Only sanitized, user-displayable interpreter exceptions."""


class LimitExceeded(LiteError):
    pass


def enabled() -> bool:
    return (os.environ.get("MEDUSA_ENGINE") == "lite"
            and os.environ.get("MEDUSA_ENABLED") == "true"
            and os.environ.get("MEDUSA_LITE_ENABLED") == "true")


def require_enabled() -> None:
    if not enabled():
        raise HTTPException(503, "Medusa Lite 尚未由衞國管理端啟用")


def checked(value, depth=0):
    if depth > 4:
        raise LiteError("資料巢狀層級過深")
    if value is None or type(value) is bool:
        return value
    if type(value) in (int, float):
        try:
            if not math.isfinite(value) or abs(value) > MAX_ABS_NUMBER:
                raise LiteError("數值超出限制")
        except OverflowError:
            raise LiteError("數值超出限制") from None
        return value
    if type(value) is str:
        if len(value) > MAX_TEXT:
            raise LiteError("文字超出限制")
        return value
    if type(value) is range:
        if len(value) > MAX_ITERATIONS:
            raise LiteError("range 迴圈超出限制")
        return value
    if type(value) in (tuple, list):
        if len(value) > MAX_ITERATIONS:
            raise LiteError("集合太長")
        for item in value:
            checked(item, depth + 1)
        return value
    raise LiteError("資料型態不允許")


def numeric(value):
    if type(value) not in (int, float):
        raise LiteError("運算需要數字")
    return checked(value)


def display(value):
    checked(value)
    if value is None:
        return "None"
    if type(value) is bool:
        return "True" if value else "False"
    return str(value)


class Engine:
    def __init__(self, stdin: str):
        self.vars = {}
        self.stdin = iter(stdin.splitlines())
        self.out = ""
        self.steps = 0
        self.deadline = time.monotonic() + 0.5

    def tick(self):
        self.steps += 1
        if self.steps > MAX_STEPS or time.monotonic() > self.deadline:
            raise LimitExceeded("執行時間或步數超過限制")

    def expr(self, node, depth=0):
        self.tick()
        if depth > 14:
            raise LiteError("表達式太深")
        def get(n):
            return self.expr(n, depth + 1)
        if isinstance(node, ast.Constant):
            return checked(node.value)
        if isinstance(node, ast.Name):
            if node.id not in self.vars:
                raise LiteError("未知變數：" + node.id[:32])
            return self.vars[node.id]
        if isinstance(node, (ast.Tuple, ast.List)):
            if len(node.elts) > MAX_ITERATIONS:
                raise LiteError("集合太長")
            values = [get(x) for x in node.elts]
            return checked(tuple(values) if isinstance(node, ast.Tuple) else values)
        if isinstance(node, ast.UnaryOp):
            value = get(node.operand)
            if isinstance(node.op, ast.Not):
                return not bool(value)
            val = numeric(value)
            return checked(-val if isinstance(node.op, ast.USub) else +val)
        if isinstance(node, ast.BinOp):
            a, b = get(node.left), get(node.right)
            if isinstance(node.op, ast.Add) and type(a) is type(b) is str:
                if len(a) + len(b) > MAX_TEXT:
                    raise LiteError("文字太長")
                return a + b
            if isinstance(node.op, ast.Mult) and type(a) is str and type(b) is int:
                if b < 0 or len(a) * b > MAX_TEXT:
                    raise LiteError("文字重複超出限制")
                return a * b
            a, b = numeric(a), numeric(b)
            try:
                if isinstance(node.op, ast.Add): result = a + b
                elif isinstance(node.op, ast.Sub): result = a - b
                elif isinstance(node.op, ast.Mult): result = a * b
                elif isinstance(node.op, ast.Div): result = a / b
                elif isinstance(node.op, ast.FloorDiv): result = a // b
                elif isinstance(node.op, ast.Mod): result = a % b
                elif isinstance(node.op, ast.Pow):
                    if abs(a) > 10000 or abs(b) > 8:
                        raise LiteError("次方運算超出限制")
                    result = a ** b
                else:
                    raise LiteError("不支援的運算子")
            except (OverflowError, ArithmeticError):
                raise LiteError("算術運算錯誤或除以零") from None
            return checked(result)
        if isinstance(node, ast.BoolOp):
            result = get(node.values[0])
            for part in node.values[1:]:
                if isinstance(node.op, ast.And) and not result: break
                if isinstance(node.op, ast.Or) and result: break
                result = get(part)
            return result
        if isinstance(node, ast.Compare):
            left = get(node.left)
            for op, part in zip(node.ops, node.comparators):
                right = get(part)
                if type(left) not in (int, float, bool, str) or type(right) not in (int, float, bool, str):
                    raise LiteError("無法比較此資料型態")
                if (type(left) is str) != (type(right) is str):
                    raise LiteError("文字不能與數字比較")
                if isinstance(op, ast.Eq): ok = left == right
                elif isinstance(op, ast.NotEq): ok = left != right
                elif isinstance(op, ast.Lt): ok = left < right
                elif isinstance(op, ast.LtE): ok = left <= right
                elif isinstance(op, ast.Gt): ok = left > right
                elif isinstance(op, ast.GtE): ok = left >= right
                else: raise LiteError("不支援比較")
                if not ok: return False
                left = right
            return True
        if isinstance(node, ast.IfExp):
            return get(node.body if get(node.test) else node.orelse)
        if isinstance(node, ast.Subscript):
            seq, index = get(node.value), get(node.slice)
            if type(seq) not in (list, tuple, str, range) or type(index) is not int:
                raise LiteError("僅允許集合的整數索引")
            try:
                return checked(seq[index])
            except IndexError:
                raise LiteError("索引超出範圍") from None
        if isinstance(node, ast.Call):
            if (not isinstance(node.func, ast.Name)
                    or node.func.id not in FUNCTIONS or node.keywords):
                raise LiteError("函式不在允許清單中")
            if len(node.args) > 8:
                raise LiteError("函式參數太多")
            return self.call(node.func.id, [get(n) for n in node.args])
        raise LiteError("不支援此語法")

    def call(self, name, args):
        self.tick()
        if name == "print":
            line = " ".join(display(x) for x in args) + "\n"
            if len(self.out.encode("utf-8")) + len(line.encode("utf-8")) > MAX_OUTPUT:
                raise LiteError("輸出量超出限制")
            self.out += line
            return None
        if name == "input":
            if len(args) > 1 or (args and type(args[0]) is not str):
                raise LiteError("input 只接受文字提示")
            if args:
                self.call("print", args)
            return checked(next(self.stdin, ""))
        if name == "range":
            if not 1 <= len(args) <= 3 or any(type(x) is not int for x in args):
                raise LiteError("range 只接受整數參數")
            try:
                return checked(range(*args))
            except ValueError:
                raise LiteError("range 步長不得為零") from None
        if name == "len":
            if len(args) != 1 or type(args[0]) not in (list, tuple, str, range):
                raise LiteError("len 只接受集合或字串")
            return len(args[0])
        if name in ("sum", "min", "max"):
            if len(args) != 1 or type(args[0]) not in (list, tuple, range):
                raise LiteError(name + " 只接受集合")
            values = args[0]
            if name == "sum":
                total = 0
                for value in values:
                    self.tick()
                    total = checked(total + numeric(value))
                return total
            if not values:
                raise LiteError("集合不能為空")
            for value in values:
                self.tick()
                numeric(value)
            return checked(min(values) if name == "min" else max(values))
        if name == "abs" and len(args) == 1:
            return checked(abs(numeric(args[0])))
        if name == "round" and 1 <= len(args) <= 2:
            if len(args) == 2 and (type(args[1]) is not int or abs(args[1]) > 10):
                raise LiteError("round 位數超出限制")
            return checked(round(numeric(args[0]), *args[1:]))
        if name in ("int", "float", "str", "bool") and len(args) == 1:
            value = args[0]
            if type(value) not in (int, float, str, bool):
                raise LiteError("型態轉換只能使用基本值")
            if name == "str": return checked(display(value))
            if name == "bool": return bool(value)
            try:
                return checked(int(value) if name == "int" else float(value))
            except (ValueError, OverflowError):
                raise LiteError("數值型態轉換失敗") from None
        raise LiteError("不支援的函式參數")

    def statements(self, body, depth=0):
        if depth > 14:
            raise LiteError("巢狀層級過深")
        for node in body:
            self.tick()
            if isinstance(node, ast.Pass): continue
            if isinstance(node, ast.Expr):
                self.expr(node.value)
                continue
            if isinstance(node, (ast.Assign, ast.AugAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                if len(targets) != 1 or not isinstance(targets[0], ast.Name):
                    raise LiteError("只能指定單一變數")
                name = targets[0].id
                if name.startswith("_") or name in FUNCTIONS or len(name) > 32:
                    raise LiteError("變數名稱不允許")
                if isinstance(node, ast.AugAssign):
                    if name not in self.vars: raise LiteError("未知變數")
                    guarded = ast.BinOp(left=ast.Name(id=name, ctx=ast.Load()),
                                        op=node.op, right=node.value)
                    value = self.expr(guarded)
                else:
                    value = self.expr(node.value)
                if len(self.vars) >= 32 and name not in self.vars:
                    raise LiteError("變數數量超出限制")
                self.vars[name] = checked(value)
                continue
            if isinstance(node, ast.If):
                self.statements(node.body if self.expr(node.test) else node.orelse, depth + 1)
                continue
            if isinstance(node, ast.For):
                if (not isinstance(node.target, ast.Name)
                        or node.target.id.startswith("_")
                        or node.target.id in FUNCTIONS or len(node.target.id) > 32):
                    raise LiteError("for 只能使用一般變數")
                values = self.expr(node.iter)
                if type(values) is not range:
                    raise LiteError("for 只支援 range(...)")
                if len(self.vars) >= 32 and node.target.id not in self.vars:
                    raise LiteError("變數數量超出限制")
                for item in values:
                    self.tick()
                    self.vars[node.target.id] = checked(item)
                    self.statements(node.body, depth + 1)
                if node.orelse:
                    self.statements(node.orelse, depth + 1)
                continue
            raise LiteError("不支援此敘述")


def make_result(ok, status_id, name, output, error, compilation, exit_code, started):
    return {
        "engine": "medusa", "backend": "medusa-lite", "language": "python-subset",
        "finished": True, "accepted": ok, "status_id": status_id, "status": name,
        "stdout": output[:MAX_OUTPUT], "stderr": error[:MAX_OUTPUT],
        "compile_output": compilation[:MAX_OUTPUT], "exit_code": exit_code,
        "time": f"{time.monotonic() - started:.3f}", "memory": None,
    }


def run_subset(source: str, stdin: str = "") -> dict:
    start = time.monotonic()
    try:
        tree = ast.parse(source, mode="exec")
    except (SyntaxError, ValueError, RecursionError):
        return make_result(False, 6, "Compilation Error", "", "",
                           "程式語法無法解析", 1, start)
    nodes = list(ast.walk(tree))
    if len(nodes) > 200 or any(not isinstance(n, ALLOWED) for n in nodes):
        return make_result(False, 6, "Unsupported Syntax", "", "",
                           "程式包含不支援的 Python 語法", 1, start)
    engine = Engine(stdin)
    try:
        engine.statements(tree.body)
        return make_result(True, 3, "Accepted", engine.out, "", "", 0, start)
    except LimitExceeded as exc:
        return make_result(False, 5, "Time Limit Exceeded",
                           engine.out, str(exc), "", None, start)
    except LiteError as exc:
        return make_result(False, 11, "Runtime Error",
                           engine.out, str(exc), "", 1, start)
    except (ArithmeticError, ValueError, TypeError, RecursionError):
        return make_result(False, 11, "Runtime Error",
                           engine.out, "運算或資料型態錯誤", "", 1, start)


async def execute_lite(request) -> dict:
    require_enabled()
    if (len(request.source_code.encode("utf-8")) > 4000
            or len(request.stdin.encode("utf-8")) > 2048):
        raise HTTPException(413, "Medusa Lite 程式碼最多 4 KB、輸入最多 2 KB")
    if "\x00" in request.source_code or "\x00" in request.stdin:
        raise HTTPException(400, "不允許 NUL 字元")
    return await asyncio.to_thread(run_subset, request.source_code, request.stdin)


def lite_status() -> dict:
    if not enabled():
        return {"enabled": False, "connected": False, "backend": "medusa-lite",
                "note": "Medusa Lite 尚未啟用"}
    result = run_subset("print(40 + 2)")
    ready = result["accepted"] and result["stdout"] == "42\n"
    return {"enabled": True, "connected": ready, "backend": "medusa-lite",
            "language": "python-subset",
            "note": ("Medusa Lite 已可在衞國雲端執行基本 Python 語法；不支援完整 Python"
                     if ready else "Medusa Lite 自我測試失敗")}
