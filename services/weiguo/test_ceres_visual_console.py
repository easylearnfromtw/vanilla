"""Ceres presentation-only regression tests for the signed Telegram Owner WebApp."""
import re
import unittest
from html.parser import HTMLParser

from ceres_admin_web import _PAGE, webapp
from ceres_command_center import _menu


class ConsoleMarkup(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids=[]
        self.nav_targets=[]
        self.links=[]
        self.inputs=[]
        self._nav=False

    def handle_starttag(self, tag, attrs):
        props=dict(attrs)
        if tag=="nav":
            self._nav=True
        if props.get("id"):
            self.ids.append(props["id"])
        if tag=="a" and self._nav:
            self.nav_targets.append(props.get("href"))
        if tag in ("button","input","select"):
            self.inputs.append((tag,props))
        if tag=="a":
            self.links.append(props.get("href"))

    def handle_endtag(self,tag):
        if tag=="nav":
            self._nav=False


class CeresVisualRegression(unittest.IsolatedAsyncioTestCase):
    def test_all_existing_javascript_controls_survive_visual_redesign(self):
        html=ConsoleMarkup()
        html.feed(_PAGE)
        self.assertEqual(len(html.ids),len(set(html.ids)),"Duplicate DOM ids break event bindings")
        ids=set(html.ids)
        for name in (
            "overview","model-panel","vault-panel","usage-panel","intent-panel",
            "health-telegram","health-agent","health-models","health-failover",
            "refresh-health","refresh-diagnostics","telegram-check","diagnostics-result",
            "refresh-usage","usage-result","form","provider","secret","save","result",
            "mode","model","compare-model","refresh","apply","models-result",
            "task-type","recommend","probe","compare","ops-result","save-price",
            "input-price","output-price","owner-intent","preview-intent",
            "confirm-intent","intent-result",
        ):
            with self.subTest(name=name):
                self.assertIn(name,ids)
        for target in html.nav_targets:
            self.assertTrue(target.startswith("#"))
            self.assertIn(target[1:],ids)
        self.assertGreaterEqual(len(html.nav_targets),5)
        for name in re.findall(r'document\.getElementById\("([^"]+)"\)',_PAGE):
            self.assertIn(name,ids,"JavaScript references an element removed by redesign: "+name)

    def test_safe_accessible_visual_foundations(self):
        self.assertIn("--tg-theme-bg-color",_PAGE)
        self.assertIn("--tg-theme-text-color",_PAGE)
        self.assertIn("prefers-reduced-motion:reduce",_PAGE)
        self.assertIn("safe-area-inset-bottom",_PAGE)
        self.assertIn("focus-visible",_PAGE)
        self.assertIn('aria-live="polite"',_PAGE)
        self.assertIn('id="secret" type="password"',_PAGE)
        self.assertNotIn("fonts.googleapis.com",_PAGE)
        self.assertNotIn("onclick=", _PAGE)
        self.assertNotIn("http://",_PAGE)

    async def test_signed_webapp_headers_unchanged(self):
        response=await webapp()
        self.assertIn("frame-ancestors 'none'",response.headers["content-security-policy"])
        self.assertIn("https://telegram.org",response.headers["content-security-policy"])
        self.assertEqual(response.headers["cache-control"],"no-store, private")
        self.assertIn("Ceres",response.body.decode())

    def test_native_owner_keyboard_preserves_callback_ids(self):
        buttons=_menu()
        actions={item["callback_data"] for row in buttons for item in row}
        self.assertEqual(actions,{
            "hub:status","hub:tools","hub:nodes","hub:providers",
            "hub:accounts","hub:sources","hub:diagnostics","hub:usage"
        })
        self.assertTrue(all(1<=len(row)<=2 for row in buttons))


if __name__=="__main__":
    unittest.main()
