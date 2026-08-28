import json
import unittest
import urllib.error
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from scripts import update_catalogs


class CatalogUpdaterTests(unittest.TestCase):
    @patch.object(update_catalogs.time, "sleep")
    @patch.object(update_catalogs.urllib.request, "urlopen", side_effect=urllib.error.URLError("offline"))
    def test_fetch_respects_source_specific_attempt_limit(self, urlopen, _sleep):
        with self.assertRaises(urllib.error.URLError):
            update_catalogs.fetch("https://example.invalid", attempts=2)

        self.assertEqual(urlopen.call_count, 2)

    def test_bambu_variant_parser_reads_color_code_and_image(self):
        page = b"""<li value="Apple Green (11502)">
            <img src="/swatches/apple-green.png">
        </li>""".decode()

        self.assertEqual(
            update_catalogs.parse_bambu_variants(page, "https://store.example/products/pla"),
            [("Apple Green", "11502", "https://store.example/swatches/apple-green.png")],
        )

    def test_threadcolors_parser_reads_canonical_row(self):
        page = b"""<table id="closest-colors"><tr>
            <td></td><td>310</td><td>Black</td><td>0</td><td>0</td><td>0</td><td>000000</td>
        </tr></table>"""

        self.assertEqual(
            update_catalogs.parse_threadcolors(page),
            {"310": {"number": "310", "colorName": "Black", "color": "#000000"}},
        )

    def test_empty_bambu_page_preserves_previous_rows(self):
        previous = [{"id": "kept", "family": "PLA Basic", "color": "Black", "productCode": "10101", "swatch": "#000"}]

        with patch.object(update_catalogs, "fetch", return_value=b"<html></html>"), redirect_stderr(StringIO()):
            result = update_catalogs.parse_bambu_product("pla-basic-filament", "PLA Basic", previous)

        self.assertIs(result, previous)

    def test_dmc_source_failure_without_snapshot_is_fatal(self):
        with TemporaryDirectory() as directory:
            missing_snapshot = Path(directory) / "missing.json"
            with (
                patch.object(update_catalogs, "DMC_SNAPSHOT_PATH", missing_snapshot),
                patch.object(update_catalogs, "fetch", return_value=b"<html></html>"),
                self.assertRaisesRegex(RuntimeError, "no previous DMC snapshot"),
            ):
                update_catalogs.parse_dmc()

    def test_snapshot_writes_replace_complete_files(self):
        with TemporaryDirectory() as directory:
            catalog_dir = Path(directory)
            bambu_path = catalog_dir / "bambu.json"
            dmc_path = catalog_dir / "dmc.json"
            with (
                patch.object(update_catalogs, "CATALOG_DIR", catalog_dir),
                patch.object(update_catalogs, "BAMBU_SNAPSHOT_PATH", bambu_path),
                patch.object(update_catalogs, "DMC_SNAPSHOT_PATH", dmc_path),
            ):
                update_catalogs.write_snapshots({"entries": [{"id": "b"}]}, {"entries": [{"number": "310"}]})

            self.assertEqual(json.loads(bambu_path.read_text())["entries"], [{"id": "b"}])
            self.assertEqual(json.loads(dmc_path.read_text())["entries"], [{"number": "310"}])
            self.assertEqual(list(catalog_dir.glob("*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
