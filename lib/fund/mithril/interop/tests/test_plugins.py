import unittest
from unittest.mock import patch
from mithril_interop import Refusal
from mithril_interop.plugins import dispatch
class Tests(unittest.TestCase):
    def test_missing_operation_refused(self):
        with patch("mithril_interop.plugins.entry_points", return_value=[]):
            self.assertEqual([], dispatch({"operation":"plugins"})["plugins"])
            with self.assertRaises(Refusal): dispatch({"operation":"xml-import"})
    def test_nonobject_refused(self):
        with self.assertRaises(Refusal): dispatch([])

    def test_identity_and_collision_refused(self):
        class P:
            id="fund.mithril.fake"
            rpc_version=1
            operations=("fake",)
        class EP:
            name="fund.mithril.fake"
            def load(self): return P
        with patch("mithril_interop.plugins.entry_points",return_value=[EP(),EP()]):
            with self.assertRaises(Refusal): dispatch({"operation":"fake"})
        P.rpc_version=2
        with patch("mithril_interop.plugins.entry_points",return_value=[EP()]):
            with self.assertRaises(Refusal): dispatch({"operation":"fake"})
