"""Small real, auditable Detroit tools usable from a Telegram private chat.

This is NOT an arbitrary tool registry. External chat text never grants the
privileges of GitHub, Medusa, Quirinus, email, browser mutation or file access.
"""
from __future__ import annotations

import ast
from html.parser import HTMLParser
import re
import statistics
from urllib.parse import urlsplit

import httpx
from policy import PolicyError, allow_hosts, validate_url


class ToolDenied(Exception):
    pass


_BLOCKED = re.compile(
    r"(?:幫我|請|直接|立刻|現在|替我|幫忙).{0,32}"
    r"(?:刪除|移除|部署|寄信|發送郵件|付款|轉帳|購買|安裝|執行程式|改密碼|修改權限)"
    r"|(?:^|\s)(?:delete|deploy|install|run|execute|transfer|checkout|commit|push|merge)(?:\s|$)",
    re.I
)
_CALC = re.compile(r"^(?:/calc|/計算|@CREAM\s*計算|計算[：:]?|算一下[：:]?)\s*(.+)$", re.I | re.S)
_CSV = re.compile(r"^(?:/cream|@CREAM\s*統計)\s+([\d.,\s\-]+)$", re.I)
_SCOUTS = re.compile(r"^(?:/scouts|@Scouts\s*閱讀|閱讀)\s+(https://\S+)$", re.I)
_HELP = re.compile(r"^(?:/start|/help|/tools|有哪些工具|工具清單|你可以做什麼)\s*$", re.I)


def calculate(expression: str) -> float:
    if len(expression) > 100 or not re.fullmatch(r"[\d.\s()+\-*/]+", expression):
        raise ToolDenied("CREAM 只接受 100 字元內的數字與加減乘除")
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise ToolDenied("CREAM 計算式格式不正確") from exc
    nodes = list(ast.walk(tree))
    if len(nodes) > 35:
        raise ToolDenied("CREAM 計算式過於複雜")

    def walk(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return walk(node.body)
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            out = float(node.value)
        elif isinstance(node, ast.UnaryOp) and type(node.op) in (ast.UAdd, ast.USub):
            out = walk(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
        elif isinstance(node, ast.BinOp) and type(node.op) in (
            ast.Add, ast.Sub, ast.Mult, ast.Div
        ):
            left, right = walk(node.left), walk(node.right)
            if isinstance(node.op, ast.Add):
                out = left + right
            elif isinstance(node.op, ast.Sub):
                out = left - right
            elif isinstance(node.op, ast.Mult):
                out = left * right
            else:
                if right == 0:
                    raise ToolDenied("CREAM 不能除以零")
                out = left / right
        else:
            raise ToolDenied("CREAM 不允許這種運算")
        if not (-1e12 <= out <= 1e12):
            raise ToolDenied("CREAM 結果超過安全範圍")
        return out

    return round(walk(tree), 10)


class _Readable(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.text: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg"):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self.hidden > 0:
            self.hidden -= 1

    def handle_data(self, data):
        if self.hidden == 0 and data.strip():
            self.text.append(data.strip())


async def scouts_read(url: str) -> tuple[str, str]:
    """Read only a pre-allowlisted public HTTPS host; no clicks, redirects or writes."""
    if len(url) > 2048:
        raise ToolDenied("Scouts 網址過長")
    try:
        validated = validate_url(url, allow_hosts(), check_dns=True)
    except (PolicyError, ValueError):
        raise ToolDenied("Scouts 只能閱讀衞國已核准的公開 HTTPS 網站") from None
    try:
        async with httpx.AsyncClient(timeout=10.0, trust_env=False,
                                     follow_redirects=False) as client:
            response = await client.get(validated, headers={"Accept": "text/html, text/plain"})
            if response.status_code != 200:
                raise ToolDenied("Scouts 網站無法讀取")
            ctype = response.headers.get("Content-Type", "").lower()
            if "text/html" not in ctype and "text/plain" not in ctype:
                raise ToolDenied("Scouts 不支援這種檔案類型")
            if len(response.content) > 75000:
                raise ToolDenied("Scouts 網頁超過大小上限")
            data = response.text
    except (httpx.HTTPError, ValueError):
        raise ToolDenied("Scouts 讀取公開網頁失敗") from None
    if "text/html" in ctype:
        parser = _Readable()
        parser.feed(data)
        data = " ".join(parser.text)
    cleaned = re.sub(r"\s+", " ", data).strip()[:3500]
    if len(cleaned) < 30:
        raise ToolDenied("Scouts 網頁沒有足夠的可讀文字")
    return validated, cleaned


async def choose_tool(message: str) -> tuple[str | None, str, str]:
    """Return (complete deterministic reply, tool used, vetted source for model)."""
    source = message.strip()
    if _BLOCKED.search(source):
        return ("Diana：此操作需要在 Vanilla 工作台獨立授權。"
                "Telegram 不會自動部署、修改檔案、付款、寄信或執行程式。", "diana", "")
    if _HELP.fullmatch(source):
        return ("Ceres／Detroit 可直接智慧聊天（需要已連線的常駐模型）。"
                "\n唯讀工具：/calc 1+2、/cream 1,2,3、/scouts https://核准網站。"
                "\n程式執行、檔案更動及外部操作必須回到 Vanilla 授權。", "diana", "")
    math = _CALC.match(source)
    if math:
        return (f"CREAM 計算：{calculate(math.group(1)):g}", "cream", "")
    data = _CSV.match(source)
    if data:
        try:
            values = [float(v.strip()) for v in data.group(1).split(",")]
            if not 1 <= len(values) <= 50 or any(not -1e12 <= n <= 1e12 for n in values):
                raise ValueError()
        except ValueError:
            raise ToolDenied("CREAM 統計需提供 1–50 個以逗號分隔的數字") from None
        return (f"CREAM 統計：{len(values)} 筆；總和 {sum(values):g}；"
                f"平均 {statistics.mean(values):g}；中位數 {statistics.median(values):g}。", "cream", "")
    page = _SCOUTS.match(source)
    if page:
        url, text = await scouts_read(page.group(1))
        return (None, "scouts", "Scouts 已讀取的公開網頁網址："+url+"\n網頁正文："+text)
    if source.startswith(("@Medusa", "@Quirinus", "@Janus", "@LUNA", "@Retina", "/部署", "/執行")):
        return ("Diana：已辨識該 Detroit 工具，但它需要在 Vanilla 工作台個別授權才能執行。", "diana", "")
    return None, "merlin", ""
