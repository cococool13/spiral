import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

from browser_collection.plan import load_plan
from browser_collection.models import (
    BrowserInstallation,
    BrowserPlan,
    PlannedControl,
    PreviewResult,
    ResolvedProfile,
    Risk,
    SupportState,
)


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "browser_collection.py"


def load_cli_module():
    spec = importlib.util.spec_from_file_location(
        "browser_collection_cli",
        CLI,
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def example_preview(*, blocked=False):
    profile = ResolvedProfile(
        id="balanced-daily",
        name="Balanced Daily",
        description="Example",
        risk=Risk.LOW,
        modules=("security-foundation",),
        controls=(),
    )
    installation = BrowserInstallation(
        browser_id="brave",
        name="Brave",
        platform="macos",
        path="/Applications/Brave Browser.app",
    )
    control = PlannedControl(
        control_id="security.safe-browsing",
        vendor_name="SafeBrowsingProtectionLevel",
        current_value=None,
        desired_value=1,
        action="unsupported" if blocked else "add",
        support=(
            SupportState.UNSUPPORTED
            if blocked
            else SupportState.PREVIEW_READY
        ),
        required=True,
        reason="No verified mapping." if blocked else "",
    )
    return PreviewResult(
        schema_version=1,
        profile=profile,
        browser_plans=(
            BrowserPlan("brave", installation, (control,)),
        ),
        plan_hash="a" * 64,
        blocked=blocked,
    )


class CliTests(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, str(CLI), *args],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_catalog_json_is_valid_without_elevation(self):
        result = self.run_cli("--catalog", "--format", "json")
        payload = json.loads(result.stdout)
        self.assertEqual(0, result.returncode)
        self.assertEqual("spiral-browser-collection", payload["tool"]["id"])
        self.assertFalse(payload["tool"]["mutating_commands_available"])
        self.assertEqual("", result.stderr)

    def test_catalog_json_is_deterministic(self):
        first = self.run_cli("--catalog", "--format", "json")
        second = self.run_cli("--catalog", "--format", "json")
        self.assertEqual(0, first.returncode)
        self.assertEqual(first.stdout, second.stdout)

    def test_detect_json_has_explicit_installation_fields(self):
        result = self.run_cli(
            "--detect",
            "--browser",
            "brave",
            "--format",
            "json",
        )
        payload = json.loads(result.stdout)
        self.assertEqual(0, result.returncode)
        self.assertEqual(["brave"], sorted(payload))
        for installation in payload["brave"]:
            self.assertEqual(
                {
                    "browser_id",
                    "name",
                    "path",
                    "platform",
                    "version",
                },
                set(installation),
            )

    def test_preview_json_declares_read_only(self):
        result = self.run_cli(
            "--preview",
            "balanced-daily",
            "--browser",
            "brave",
            "--format",
            "json",
        )
        payload = json.loads(result.stdout)
        self.assertEqual(0, result.returncode)
        self.assertFalse(payload["mutates_system"])
        self.assertEqual("preview", payload["operation"])
        self.assertEqual(64, len(payload["plan_hash"]))

    def test_apply_flag_does_not_exist_in_milestone_one(self):
        result = self.run_cli("--apply", "balanced-daily")
        self.assertEqual(2, result.returncode)
        self.assertIn("unrecognized arguments", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_actions_are_mutually_exclusive(self):
        result = self.run_cli("--catalog", "--detect")
        self.assertEqual(2, result.returncode)
        self.assertIn("not allowed with argument", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_catalog_rejects_browser_selection(self):
        result = self.run_cli("--catalog", "--browser", "brave")
        self.assertEqual(2, result.returncode)
        self.assertIn("--browser is only valid", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_unknown_browser_is_a_clean_configuration_error(self):
        result = self.run_cli("--detect", "--browser", "unknown")
        self.assertEqual(2, result.returncode)
        self.assertIn("unknown browser", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_unknown_profile_is_a_clean_configuration_error(self):
        result = self.run_cli("--preview", "missing", "--browser", "brave")
        self.assertEqual(2, result.returncode)
        self.assertIn("unknown profile", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_empty_browser_selection_is_rejected(self):
        result = self.run_cli("--detect", "--browser", ",")
        self.assertEqual(2, result.returncode)
        self.assertIn("at least one browser", result.stderr)
        self.assertNotIn("Traceback", result.stderr)

    def test_blocked_preview_returns_exit_code_three(self):
        cli = load_cli_module()

        class BlockedEngine:
            def preview(self, profile_id, browser_ids):
                self.profile_id = profile_id
                self.browser_ids = browser_ids
                return example_preview(blocked=True)

        output = io.StringIO()
        # Nested rather than parenthesized: the repo's ruff target is py38,
        # where `with (a, b):` is a syntax error.
        with patch.object(cli, "build_engine", return_value=BlockedEngine()), \
                redirect_stdout(output):
            result = cli.main([
                "--preview",
                "balanced-daily",
                "--browser",
                "brave",
                "--format",
                "json",
            ])
        payload = json.loads(output.getvalue())
        self.assertEqual(3, result)
        self.assertTrue(payload["blocked"])


class RenderTests(unittest.TestCase):
    def test_preview_json_renderer_is_deterministic_and_complete(self):
        from browser_collection.render import preview_to_dict

        first = preview_to_dict(example_preview())
        second = preview_to_dict(example_preview())
        self.assertEqual(first, second)
        self.assertEqual("brave", first["browsers"][0]["id"])
        self.assertEqual(
            "SafeBrowsingProtectionLevel",
            first["browsers"][0]["controls"][0]["vendor_name"],
        )

    def test_preview_text_renderer_has_stable_summary(self):
        from browser_collection.render import render_preview_text

        self.assertEqual(
            "\n".join((
                "Preview only — no changes will be made.",
                "Profile: Balanced Daily (low)",
                f"Plan: {'a' * 64}",
                "Brave: /Applications/Brave Browser.app",
                "  1 add",
            )),
            render_preview_text(example_preview()),
        )

    def test_blocked_preview_text_explains_block(self):
        from browser_collection.render import render_preview_text

        rendered = render_preview_text(example_preview(blocked=True))
        self.assertIn(
            "Blocked: at least one required control is unsupported.",
            rendered,
        )


if __name__ == "__main__":
    unittest.main()


def platform_supported():
    """True when the engine can resolve controls for this host.

    `--export-plan` runs the real engine, which resolves nothing on a platform
    with no adapter mapping. On Linux that refusal is correct behaviour, not a
    failure, so the tests that need a plan skip and a separate test asserts the
    refusal.
    """
    return sys.platform in ("darwin", "win32")


@unittest.skipUnless(
    platform_supported(),
    "the engine resolves no controls on this platform",
)
class ExportPlanTests(unittest.TestCase):
    """`--export-plan` is what makes the command-line flow work at all.

    Before it existed the documented Windows steps piped `--preview` output
    into `--apply-plan`, and the applier rejected it: a preview is a report
    for a person, a plan is the exact policy map for a machine. Only the
    desktop app could build one.
    """

    def setUp(self):
        self.cli = load_cli_module()

    def run_cli(self, argv):
        output = io.StringIO()
        with redirect_stdout(output):
            code = self.cli.main(argv)
        return code, output.getvalue()

    def test_the_exported_plan_is_accepted_by_the_shared_validator(self):
        code, out = self.run_cli(["--export-plan", "balanced-daily"])
        self.assertEqual(code, 0)
        with tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8",
        ) as handle:
            handle.write(out)
            path = handle.name
        profile_id, plan_hash, policy = load_plan(path)
        self.assertEqual(profile_id, "balanced-daily")
        self.assertEqual(len(plan_hash), 64)
        self.assertTrue(policy)

    def test_the_plan_carries_only_the_four_fields_load_plan_allows(self):
        _, out = self.run_cli(["--export-plan", "balanced-daily"])
        self.assertEqual(
            set(json.loads(out)),
            {"schema_version", "profile_id", "plan_hash", "policy"},
        )

    def test_unsupported_controls_are_left_out(self):
        payload = {
            "schema_version": 1,
            "plan_hash": "a" * 64,
            "profile": {"id": "x"},
            "browsers": [{
                "controls": [
                    {"vendor_name": "Kept", "desired": True,
                     "support": "preview_ready"},
                    {"vendor_name": "", "desired": "x",
                     "support": "unsupported"},
                ],
            }],
        }
        plan = self.cli.plan_from_preview(payload)
        self.assertEqual(plan["policy"], {"Kept": True})

    def test_every_bundled_profile_exports_an_applicable_plan(self):
        for profile_id in ("balanced-daily", "maximum-performance",
                           "minimal-debloated"):
            with self.subTest(profile=profile_id):
                code, out = self.run_cli(["--export-plan", profile_id])
                self.assertEqual(code, 0)
                self.assertTrue(json.loads(out)["policy"])


class ExportPlanOnUnsupportedPlatformTests(unittest.TestCase):
    @unittest.skipIf(
        platform_supported(),
        "only meaningful where the engine has no adapter mapping",
    )
    def test_export_refuses_and_says_why(self):
        cli = load_cli_module()
        errors = io.StringIO()
        with redirect_stderr(errors):
            code = cli.main(["--export-plan", "balanced-daily"])
        self.assertEqual(code, 2)
        # Resolving against a synthetic installation means the engine now
        # reaches the profile and reports it blocked, rather than finding no
        # browser at all. Either way the refusal has to name the platform as
        # the reason, so that is what this asserts.
        message = errors.getvalue()
        self.assertIn("balanced-daily", message)
        self.assertIn("platform", message)
