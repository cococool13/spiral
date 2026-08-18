import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TAURI_CONF = ROOT / "desktop" / "src-tauri" / "tauri.conf.json"
BRIDGE = ROOT / "desktop" / "src-tauri" / "src" / "bridge.rs"
PROJECT = ROOT / "desktop" / "src-tauri" / "src" / "project.rs"


class DesktopBundleTests(unittest.TestCase):
    def test_every_bundled_resource_exists_in_the_checkout(self):
        # A missing source here fails `tauri build` after the resources
        # are copied, not at compile time. The next slim-v* tag has to
        # pack spiral-slim-mac.py; slimbrave-mac.py is gone.
        conf = json.loads(TAURI_CONF.read_text())
        resources = conf["bundle"]["resources"]
        missing = [
            source
            for source in resources
            if not (TAURI_CONF.parent / source).exists()
        ]
        self.assertEqual(missing, [])

    def test_macos_wizard_drives_spiral_slim_mac(self):
        conf = json.loads(TAURI_CONF.read_text())
        resources = conf["bundle"]["resources"]
        self.assertIn("../../spiral-slim-mac.py", resources)
        self.assertEqual(
            resources["../../spiral-slim-mac.py"],
            "slimbrave/spiral-slim-mac.py",
        )
        self.assertNotIn("../../slimbrave-mac.py", resources)
        self.assertIn('Some("spiral-slim-mac.py")', BRIDGE.read_text())
        self.assertIn('"spiral-slim-mac.py"', PROJECT.read_text())
        self.assertNotIn("slimbrave-mac.py", BRIDGE.read_text())
        self.assertNotIn("slimbrave-mac.py", PROJECT.read_text())


if __name__ == "__main__":
    unittest.main()
