from pathlib import Path
import socket
import subprocess
import time
import sys
import unittest
from mithril_interop import Refusal
from mithril_hla import hla

ROOT = Path(__file__).resolve().parents[1]
HOST = ROOT / "build/native/mithril-hla"

class HLATests(unittest.TestCase):
    def test_opaque_encoding_count_and_roundtrip(self):
        payload = b"\x00\xff\x01"
        self.assertEqual(bytes.fromhex("0000000300ff01"), hla.opaque(payload))
        self.assertEqual(payload, hla.decode_opaque(hla.opaque(payload)))
        with self.assertRaises(Refusal):
            hla.decode_opaque(bytes.fromhex("0000000400ff01"))

    @unittest.skipUnless(HOST.exists(), "run scripts/build-hla.sh")
    def test_real_rti_join_reflection_timestamp_delivery_and_time_grants(self):
        result = hla.exercise(HOST, ROOT / "examples/mithril-fom.xml")
        self.assertTrue(result["payloadVerified"])
        self.assertEqual((2, 1, 1, 2), (result["federates"], result["interactions"], result["objectReflections"], result["logicalTime"]))
        interaction = next(e for e in result["events"] if e["type"] == "interaction")
        self.assertEqual(1, interaction["time"])
        self.assertEqual(b'{"event":"relief-received"}', hla.decode_opaque(bytes.fromhex(interaction["valuesHex"][0])))

    @unittest.skipUnless(HOST.exists(), "run scripts/build-hla.sh")
    def test_rti_failure_and_network_endpoint_are_not_reported_as_success(self):
        with hla.Runtime(HOST) as r:
            with self.assertRaises(Refusal):
                r.command("a", "connect", "rti://127.0.0.1:9")
            r.command("a", "connect", "thread://")
            with self.assertRaises(Refusal):
                r.command("a", "join", "a", "AbsentFederation")
            self.assertEqual({}, r.times)
            with self.assertRaises(Refusal):
                r.advance("a", float("nan"))
            with self.assertRaises(Refusal):
                r.command("a", "create", "bad", "/missing/fom.xml")

    @unittest.skipUnless(HOST.exists() and (ROOT / ".cache/openrti/install/bin/rtinode").exists(), "build native RTI")
    @unittest.skipIf(sys.platform == "darwin", "OpenRTI TCP handshake times out on this macOS host; Linux CI runs this gate")
    def test_real_tcp_rti_server_exchanges_objects_events_and_time_grants(self):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        endpoint = f"rti://127.0.0.1:{port}"
        server = subprocess.Popen([str(ROOT / ".cache/openrti/install/bin/rtinode"), "-i", endpoint],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            deadline = time.monotonic() + 5
            while True:
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=.1):
                        break
                except OSError:
                    if server.poll() is not None or time.monotonic() > deadline:
                        self.fail("RTI server did not start")
                    time.sleep(.02)
            result = hla.exercise(HOST, ROOT / "examples/mithril-fom.xml", endpoint=endpoint)
            self.assertTrue(result["payloadVerified"])
            self.assertEqual(endpoint, result["transport"])
        finally:
            server.terminate()
            server.wait(timeout=3)

if __name__ == "__main__":
    unittest.main()
