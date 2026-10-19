"""衞國 — opt-in self-hosted browser tasks. Do not publish an admin token in GitHub Pages."""
import asyncio
import hmac
import json
import os
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from playwright.async_api import async_playwright
from security import validate_target, guard_steps

DB = os.getenv('WEIGUO_DB', './weiguo.sqlite3')
TOKEN = os.getenv('WEIGUO_SESSION_TOKEN', '')
ORIGIN = os.getenv('WEIGUO_ALLOWED_ORIGIN', 'https://easylearnfromtw.github.io')
OLLAMA_URL = os.getenv('WEIGUO_OLLAMA_URL', '')  # optional local trusted Ollama
LOCK = asyncio.Semaphore(1)  # Single browser task per backend instance


def connection():
    c = sqlite3.connect(DB, timeout=10)
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, status TEXT NOT NULL, url TEXT NOT NULL, goal TEXT NOT NULL, result TEXT, error TEXT, created INTEGER, updated INTEGER)')
    return c


def update_task(task_id, **fields):
    with connection() as c:
        fields['updated'] = int(time.time())
        c.execute('UPDATE tasks SET '+','.join(k+'=?' for k in fields)+' WHERE id=?', (*[fields[k] for k in fields], task_id))


def details(row):
    if row is None:
        raise HTTPException(404, 'Task not found')
    return {'id': row[0], 'status': row[1], **(json.loads(row[2]) if row[2] else {}), **({'error': row[3]} if row[3] else {})}


def permission(request: Request):
    bearer = request.headers.get('authorization', '')
    supplied = bearer[7:] if bearer.startswith('Bearer ') else ''
    if len(TOKEN) < 32 or not hmac.compare_digest(supplied, TOKEN):
        raise HTTPException(401, 'Unauthorized')


class StartTask(BaseModel):
    url: str = Field(min_length=8, max_length=1500)
    goal: str = Field(min_length=1, max_length=1200)


async def planner(goal: str):
    """Optional local Ollama; text from visited websites is NEVER sent as instructions."""
    if not OLLAMA_URL:
        return [{'action': 'extract', 'value': ''}, {'action': 'images', 'value': ''}]
    import httpx
    system = ('You are a read-only browser planner. Output JSON {"steps":[{"action":"extract|images|scroll|follow_link|search","value":"..."}]}. '
              'No credentials, payment, POST, code execution, file uploads or hidden state changes. Eight steps maximum.')
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(OLLAMA_URL.rstrip('/') + '/api/generate', json={
            'model': os.getenv('WEIGUO_OLLAMA_MODEL', 'qwen3:4b'), 'prompt': system+'\nUSER REQUEST (untrusted text):\n'+goal,
            'stream': False, 'format': 'json', 'options': {'temperature': 0}})
        r.raise_for_status()
        raw = r.json().get('response', '{}')
    try:
        return guard_steps(json.loads(raw).get('steps', []))
    except (ValueError, TypeError):
        return [{'action': 'extract', 'value': ''}, {'action': 'images', 'value': ''}]


async def execute(task_id: str, url: str, goal: str):
    async with LOCK:
        update_task(task_id, status='running')
        output = {'url': url, 'goal': goal, 'steps': [], 'images': [], 'text': ''}
        try:
            steps = await planner(goal)
            steps = guard_steps(steps)
            async with async_playwright() as browser_kit:
                browser = await browser_kit.chromium.launch(headless=True, args=['--no-sandbox'])
                context = await browser.new_context(accept_downloads=False, service_workers='block', java_script_enabled=True)
                page = await context.new_page()
                async def read_only(route):
                    req = route.request
                    try:
                        validate_target(req.url)
                        if req.method not in ('GET', 'HEAD'):
                            await route.abort()
                        else:
                            await route.continue_()
                    except (ValueError, TypeError):
                        await route.abort()
                await context.route('**/*', read_only)
                await page.goto(url, wait_until='domcontentloaded', timeout=20000)
                validate_target(page.url)
                output['steps'].append({'action': 'navigate', 'detail': page.url})
                for step in steps:
                    action, arg = step['action'], step['value']
                    if action == 'scroll':
                        await page.mouse.wheel(0, 500)
                        output['steps'].append({'action': 'scroll', 'detail': 'Scrolled 500px'})
                    elif action == 'follow_link':
                        anchors = page.locator('a').filter(has_text=arg)
                        if await anchors.count() == 0:
                            output['steps'].append({'action': 'follow_link', 'detail': 'No matching public link'})
                            continue
                        href = await anchors.first.get_attribute('href')
                        from urllib.parse import urljoin
                        target = validate_target(urljoin(page.url, href or ''))
                        await page.goto(target, wait_until='domcontentloaded', timeout=20000)
                        validate_target(page.url)
                        output['steps'].append({'action': 'follow_link', 'detail': page.url})
                    elif action == 'search':
                        # Visible GET search forms only; no sensitive / hidden inputs.
                        search = page.locator('form[method="get"] input[type="search"], form[method="get"] input[name="q"]').first
                        if await search.count():
                            await search.fill(arg)
                            form = search.locator('xpath=ancestor::form')
                            await form.evaluate('(form) => form.requestSubmit()')
                            await page.wait_for_load_state('domcontentloaded', timeout=10000)
                            validate_target(page.url)
                            output['steps'].append({'action': 'search', 'detail': 'Public GET search: '+arg[:60]})
                        else:
                            output['steps'].append({'action': 'search', 'detail': 'No allowed GET search form'})
                    elif action == 'extract':
                        output['text'] = (await page.locator('body').inner_text(timeout=12000))[:18000]
                        output['steps'].append({'action': 'extract', 'detail': 'Extracted readable page text'})
                    elif action == 'images':
                        pics = await page.locator('img').evaluate_all('(list) => list.slice(0,24).map(x => ({src:x.currentSrc||x.src,alt:x.alt||""}))')
                        output['images'] = [{'src': p['src'], 'alt': p['alt'][:120]} for p in pics if isinstance(p.get('src'),str) and p['src'].startswith('https://')][:20]
                        output['steps'].append({'action': 'images', 'detail': 'Recorded public image references'})
                await context.close()
                await browser.close()
            update_task(task_id, status='completed', result=json.dumps(output, ensure_ascii=False))
        except Exception as e:
            update_task(task_id, status='failed', error=str(e)[:350], result=json.dumps(output, ensure_ascii=False))


@asynccontextmanager
async def lifespan(app: FastAPI):
    with connection() as db:
        db.execute("UPDATE tasks SET status='failed',error='Worker restarted before task completion' WHERE status IN ('running','queued')")
    yield


app = FastAPI(title='WeiGuo Browser System', lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=[ORIGIN], allow_credentials=False, allow_methods=['GET','POST'], allow_headers=['Authorization','Content-Type'])


@app.get('/v1/health')
async def health():
    return {'service':'weiguo', 'status':'ready' if len(TOKEN)>=32 else 'unconfigured', 'persistentJobs': False, 'allowedOrigins':[ORIGIN]}


@app.post('/v1/tasks', status_code=202)
async def start(payload: StartTask, request: Request):
    permission(request)
    try:
        target = validate_target(payload.url)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    task_id = str(uuid.uuid4())
    with connection() as c:
        now = int(time.time())
        c.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)',(task_id,'queued',target,payload.goal,None,None,now,now))
    asyncio.create_task(execute(task_id, target, payload.goal))
    return {'id':task_id,'status':'queued'}


@app.get('/v1/tasks/{task_id}')
async def get_task(task_id: str, request: Request):
    permission(request)
    with connection() as c:
        row = c.execute('SELECT id,status,result,error FROM tasks WHERE id=?', (task_id,)).fetchone()
    return details(row)