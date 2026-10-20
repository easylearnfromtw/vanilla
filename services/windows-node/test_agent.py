import importlib.util,json,secrets,threading,unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.request import Request,urlopen
from urllib.error import HTTPError
spec=importlib.util.spec_from_file_location("vanilla_windows_agent",Path(__file__).with_name("agent.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class AgentTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=ThreadingHTTPServer(("127.0.0.1",0),m.API)
  cls.server.token=secrets.token_urlsafe(48);cls.server.node_id=secrets.token_hex(12)
  threading.Thread(target=cls.server.serve_forever,daemon=True).start()
 @classmethod
 def tearDownClass(cls):cls.server.shutdown();cls.server.server_close()
 def get(self,path,headers=None):
  return urlopen(Request("http://127.0.0.1:%s%s"%(self.server.server_port,path),headers=headers or {}),timeout=4)
 def test_status_requires_auth(self):
  with self.assertRaises(HTTPError) as e:self.get("/v1/status")
  self.assertEqual(e.exception.code,401)
 def test_wrong_origin_forbidden(self):
  with self.assertRaises(HTTPError) as e:self.get("/v1/status",{"Authorization":"Bearer "+self.server.token,"Origin":"https://evil.example"})
  self.assertEqual(e.exception.code,403)
 def test_status_and_no_remote_shell(self):
  h={"Authorization":"Bearer "+self.server.token}
  with self.get("/v1/status",h) as r:j=json.loads(r.read())
  self.assertEqual(j["id"],self.server.node_id)
  with self.assertRaises(HTTPError) as e:self.get("/execute",h)
  self.assertEqual(e.exception.code,404)
if __name__=="__main__":unittest.main()
