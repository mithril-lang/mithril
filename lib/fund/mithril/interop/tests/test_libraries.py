import unittest
from mithril_interop import Refusal
from mithril_interop.libraries import resolve_library, invoke_library
from mithril_interop.cli import strict_json
class LibraryTests(unittest.TestCase):
    def test_core_id_namespace_repository_and_resolver_agree(self):
        import fund.mithril.lib.interop as api
        self.assertEqual(api.LIBRARY_ID,api.resolve()["libraryId"])
        self.assertTrue(api.resolve()["repository"].endswith(api.LIBRARY_ID))
    def test_unknown_library_and_operation_refused(self):
        with self.assertRaises(Refusal):resolve_library("fund.mithril.lib.missing")
        with self.assertRaises(Refusal):invoke_library("fund.mithril.lib.interop","xml-import")
    def test_reserved_fields_and_nonjson_refused(self):
        for args in [{"libraryId":"other"},{"x":float("nan")},[],{"x":object()}]:
            with self.assertRaises(Refusal):invoke_library("fund.mithril.lib.interop","plugins",args)
    def test_duplicate_routing_and_nested_fields_refused(self):
        for data in ['{"libraryId":"a","libraryId":"b"}','{"x":{"a":1,"a":2}}']:
            with self.assertRaises(Refusal):strict_json(data)
