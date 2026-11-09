import base64,unittest
from mithril_c2sim.plugin import Plugin,ROOT
class ProfileTests(unittest.TestCase):
    def test_native_import_project(self):
        a=Plugin.call({"operation":'c2sim-import',"bytesBase64":base64.b64encode((ROOT/'c2sim-command.xml').read_bytes()).decode()})
        result=Plugin.call({"operation":'c2sim-project',"artifact":a})
        self.assertEqual(1,result["receipt"]["mappedRecords"])
        self.assertEqual('c2sim',result["model"]["records"][0]["standard"])
