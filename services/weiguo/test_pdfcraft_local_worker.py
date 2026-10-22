import base64
import os
import unittest
from unittest.mock import patch
import httpx
import pdfcraft_local_worker as local
import pdfcraft_remote as remote
from pdfcraft_engine import PdfCraftUnavailable,PdfCraftFailed
from pdfcraft_wire import verify_request

PDF=b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n'
ENV={'WEIGUO_PDFCRAFT_LOCAL_WORKER_ENABLED':'true','WEIGUO_PDFCRAFT_REMOTE_ENABLED':'false','WEIGUO_PDFCRAFT_WORKER_SECRET':'ab'*32}

class LocalWorkerTests(unittest.IsolatedAsyncioTestCase):
    def transport(self,handler):
        original=httpx.AsyncClient
        def factory(**kwargs):
            self.assertFalse(kwargs['trust_env']);self.assertFalse(kwargs['follow_redirects'])
            return original(transport=httpx.MockTransport(handler),**kwargs)
        return patch.object(local.httpx,'AsyncClient',side_effect=factory)

    async def test_fixed_signed_destination_and_ready_protocol(self):
        paths=[]
        def handler(request):
            self.assertEqual(request.url.host,'pdf-broker');self.assertEqual(request.url.port,9090)
            verify_request(request.method,request.url.path,request.content,dict(request.headers),{})
            paths.append(request.url.path)
            if request.method=='GET':return httpx.Response(200,json={'service':'pdfcraft-worker','schemaVersion':1,'ready':True,'operation':'combine-pdf'})
            return httpx.Response(200,content=PDF,headers={'content-type':'application/pdf'})
        with patch.dict(os.environ,ENV),self.transport(handler):
            self.assertTrue(await local.local_worker_ready())
            self.assertEqual(await remote.combine_pdfs([base64.b64encode(PDF).decode()]*2),PDF)
        self.assertEqual(paths,['/v1/pdfcraft/ready','/v1/pdfcraft/combine'])

    async def test_disabled_conflicting_or_missing_key_never_contacts_worker(self):
        for patch_env in [dict(ENV,WEIGUO_PDFCRAFT_LOCAL_WORKER_ENABLED='false'),dict(ENV,WEIGUO_PDFCRAFT_REMOTE_ENABLED='true'),dict(ENV,WEIGUO_PDFCRAFT_WORKER_SECRET='')]:
            with patch.dict(os.environ,patch_env),patch.object(local.httpx,'AsyncClient',side_effect=AssertionError('unexpected network')):
                self.assertFalse(await local.local_worker_ready())
                with self.assertRaises(PdfCraftUnavailable):await local.local_worker_combine([])

    async def test_redirect_bad_type_and_oversized_output_do_not_fall_back(self):
        for response in [httpx.Response(302,headers={'location':'https://other.example'}),httpx.Response(200,content=PDF,headers={'content-type':'text/plain'}),httpx.Response(200,content=PDF,headers={'content-type':'application/pdf','content-length':'999999999'})]:
            with patch.dict(os.environ,ENV),self.transport(lambda request:response),patch.object(remote,'local_combine',side_effect=AssertionError('fallback')):
                with self.assertRaises(PdfCraftFailed):await remote.combine_pdfs([base64.b64encode(PDF).decode()]*2)

    def test_remote_public_https_guard_remains_unchanged(self):
        with patch.dict(os.environ,dict(ENV,WEIGUO_PDFCRAFT_REMOTE_ENABLED='true',WEIGUO_PDFCRAFT_WORKER_URL='http://pdf-broker:9090')):
            self.assertIsNone(remote.remote_origin())

if __name__=='__main__':unittest.main()
