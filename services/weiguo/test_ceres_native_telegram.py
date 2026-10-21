"""Native Telegram UI regression tests: no external Telegram requests."""
import asyncio
import json
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from app import app
from ceres_admin_bot import _edit_target, _telegram, say, _guide, _models
from ceres_command_center import command, callback

CHAT=88334455
SUB="123456789012345678901"
SECRET="X"*40


class NativeTelegramTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        settings={
            "CERES_DB_PATH":tmp.name+"/ceres.sqlite",
            "CERES_ENABLED":"true",
            "CERES_TELEGRAM_WEBHOOK_SECRET":SECRET,
            "CERES_TELEGRAM_CHAT_IDS":str(CHAT),
            "CERES_FAMILY_LINKS_JSON":json.dumps({str(CHAT):SUB}),
            "WEIGUO_FAMILY_ACL_JSON":json.dumps({SUB:{"role":"owner","member":"Tester"}}),
        }
        context=patch.dict(os.environ,settings)
        context.start()
        self.addCleanup(context.stop)

    def run_async(self,coro):
        return asyncio.run(coro)

    def test_hub_renders_telegram_html_and_inline_buttons(self):
        with patch("ceres_admin_bot._telegram",new_callable=AsyncMock,return_value=True) as outgoing:
            self.run_async(command(CHAT,"/hub"))
            outgoing.assert_awaited_once()
            method,payload=outgoing.await_args.args
            self.assertEqual(method,"sendMessage")
            self.assertEqual(payload["parse_mode"],"HTML")
            self.assertIn("<b>Ceres</b>",payload["text"])
            self.assertGreaterEqual(len(payload["reply_markup"]["inline_keyboard"]),4)
            self.assertIn("hub:status",
                str(payload["reply_markup"]["inline_keyboard"]))

    def test_inline_navigation_edits_existing_message_not_chat_spam(self):
        with patch("ceres_command_center._telegram",new_callable=AsyncMock,return_value=True) as ack, \
             patch("ceres_admin_bot._telegram",new_callable=AsyncMock,return_value=True) as tg:
            self.run_async(callback(CHAT,"cb-1","hub:home",message_id=71))
            ack.assert_awaited_once()
            tg.assert_awaited_once()
            method,payload=tg.await_args.args
            self.assertEqual(method,"editMessageText")
            self.assertEqual(payload["message_id"],71)
            self.assertEqual(payload["parse_mode"],"HTML")

    def test_failed_edit_falls_back_once_and_context_resets(self):
        with patch("ceres_command_center._telegram",new_callable=AsyncMock,return_value=True), \
             patch("ceres_admin_bot._telegram",new_callable=AsyncMock,side_effect=[False,True,True]) as tg:
            self.run_async(callback(CHAT,"cb-1","hub:home",message_id=71))
            self.assertEqual([x.args[0] for x in tg.await_args_list[:2]],
                             ["editMessageText","sendMessage"])
            self.run_async(say(CHAT,"After callback"))
            self.assertEqual(tg.await_args.args[0],"sendMessage")
            self.assertIsNone(_edit_target.get())

    def test_owner_only_and_dynamic_data_escaped(self):
        with patch("ceres_command_center._telegram",new_callable=AsyncMock) as ack:
            self.run_async(callback(CHAT+1,"cb","hub:home",message_id=1))
            ack.assert_not_awaited()
        with patch("ceres_admin_bot.catalog",return_value={
              "models":[{"id":"fine"}], "selected":"<script>&unsafe</script>", "mode":"<auto>"
            }),patch("ceres_admin_bot._telegram",new_callable=AsyncMock,return_value=True) as tg:
            self.run_async(_models(CHAT))
            payload=tg.await_args.args[1]
            self.assertEqual(payload["parse_mode"],"HTML")
            self.assertIn("&lt;script&gt;&amp;unsafe&lt;/script&gt;",payload["text"])
            self.assertNotIn("<script>",payload["text"])
            self.assertIn("&lt;auto&gt;",payload["text"])
        self.assertIn("<b>",_guide())

    def test_one_time_slime_pairing_code_is_visible_and_copyable(self):
        import re
        with tempfile.TemporaryDirectory() as directory,patch.dict(os.environ,{
            "SLIME_ENABLED":"true","SLIME_DB_PATH":directory+"/slime.sqlite",
            "SLIME_PUBLIC_API_ORIGIN":"https://example.invalid",
        }),patch("ceres_admin_bot._telegram",new_callable=AsyncMock,return_value=True) as tg, \
             patch("ceres_admin_bot.send_pairing_qr",new_callable=AsyncMock,return_value=True) as qr:
            self.run_async(command(CHAT,"/hub invite"))
            method,payload=tg.await_args.args
            self.assertEqual(method,"sendMessage")
            self.assertEqual(payload["parse_mode"],"HTML")
            self.assertIn("節點配對碼",payload["text"])
            buttons=payload["reply_markup"]["inline_keyboard"]
            codes=[item["copy_text"]["text"] for row in buttons for item in row
                   if item.get("text")=="複製配對碼"]
            links=[item["copy_text"]["text"] for row in buttons for item in row
                   if item.get("text")=="複製邀請連結"]
            self.assertEqual(len(codes),1)
            self.assertEqual(len(links),1)
            self.assertRegex(codes[0],r"^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$")
            self.assertEqual(links[0],"https://example.invalid/#slime="+codes[0])
            self.assertIn(codes[0],payload["text"])
            qr.assert_awaited_once_with(CHAT,links[0])
            # Reusing the already issued code must not leak an installed node token.
            with patch("ceres_command_center._telegram",new_callable=AsyncMock,return_value=True),patch(
                    "ceres_admin_bot._telegram",new_callable=AsyncMock,return_value=True) as via, \
                    patch("ceres_admin_bot.send_pairing_qr",new_callable=AsyncMock,return_value=True):
                self.run_async(callback(CHAT,"cb-pair","hub:invite",message_id=33))
                self.assertEqual(via.await_args.args[0],"editMessageText")
                self.assertIn("copy_text",str(via.await_args.args[1]["reply_markup"]))
                self.assertEqual(via.await_args.args[1]["message_id"],33)

    def test_verified_signed_webhook_passes_message_id_to_handler(self):
        update={"update_id":3001,"callback_query":{
            "id":"c3","data":"hub:home","from":{"id":CHAT},
            "message":{"message_id":88,"chat":{"id":CHAT,"type":"private"}}}}
        async def req():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                         base_url="https://example.invalid") as client:
                return await client.post("/v1/ceres/telegram/webhook",json=update,headers={
                    "X-Telegram-Bot-Api-Secret-Token":SECRET})
        with patch("ceres_command_center.callback",new_callable=AsyncMock) as cb:
            response=self.run_async(req())
        self.assertEqual(response.status_code,200,response.text)
        self.assertTrue(response.json()["accepted"])
        cb.assert_awaited_once_with(CHAT,"c3","hub:home",message_id=88)


if __name__=="__main__":
    unittest.main()
