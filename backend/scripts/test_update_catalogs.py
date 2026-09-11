import json
import unittest
import urllib.error
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backend.scripts import update_catalogs


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

    def test_dmc_refresh_keeps_new_shades_and_previous_colors(self):
        previous = [{"number": "9999", "colorName": "Existing", "color": "#123456"}]
        with TemporaryDirectory() as directory:
            snapshot = Path(directory) / "dmc.json"
            snapshot.write_text(json.dumps({"entries": previous}))
            with (
                patch.object(update_catalogs, "DMC_SNAPSHOT_PATH", snapshot),
                patch.object(update_catalogs, "MIN_DMC_COLORS", 1),
                patch.object(update_catalogs, "MIN_BREIBRINK_LINKS", 1),
                patch.object(
                    update_catalogs,
                    "fetch",
                    return_value=b'<table id="closest-colors"><tr><td></td><td>3</td><td>Medium Tin</td><td>184</td><td>184</td><td>187</td><td>b8b8bb</td></tr></table>',
                ),
                patch.object(
                    update_catalogs,
                    "parse_breibrink_links",
                    return_value={"03": "https://www.breibrink.nl/dmc-03.html"},
                ),
            ):
                entries = update_catalogs.parse_dmc()["entries"]
        by_number = {entry["number"]: entry for entry in entries}
        self.assertEqual(len(entries), 36)
        self.assertEqual(len(by_number), len(entries))
        self.assertTrue({str(n).zfill(2) for n in range(1, 36)} <= by_number.keys())
        self.assertEqual(by_number["03"]["colorName"], "Medium Tin")
        self.assertEqual(by_number["03"]["link"], "https://www.breibrink.nl/dmc-03.html")
        self.assertEqual(by_number["9999"], previous[0])

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
                update_catalogs.write_snapshots(dmc={"entries": [{"number": "03"}]})

            self.assertEqual(json.loads(bambu_path.read_text())["entries"], [{"id": "b"}])
            self.assertEqual(json.loads(dmc_path.read_text())["entries"], [{"number": "03"}])
            self.assertEqual(list(catalog_dir.glob("*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
