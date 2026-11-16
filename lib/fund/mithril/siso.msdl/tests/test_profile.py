import base64,unittest
from mithril_msdl.plugin import Plugin,ROOT
class ProfileTests(unittest.TestCase):
    def test_native_import_project(self):
        a=Plugin.call({"operation":'msdl-import',"bytesBase64":base64.b64encode((ROOT/'msdl-relief.xml').read_bytes()).decode()})
        result=Plugin.call({"operation":'msdl-project',"artifact":a})
        self.assertEqual(1,result["receipt"]["mappedRecords"])
        self.assertEqual('msdl',result["model"]["records"][0]["standard"])
