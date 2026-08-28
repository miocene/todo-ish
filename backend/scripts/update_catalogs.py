#!/usr/bin/env python3
"""Build browser-ready Bambu Lab and DMC catalogue snapshots.

Run with: yarn update:catalogs
"""

from __future__ import annotations

import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
CATALOG_DIR = ROOT / "catalogs"
BAMBU_SNAPSHOT_PATH = CATALOG_DIR / "bambu-filaments.snapshot.json"
DMC_SNAPSHOT_PATH = CATALOG_DIR / "dmc-floss.snapshot.json"
BREIBRINK_DMC_URL = "https://www.breibrink.nl/borduren/borduurgarens/dmc-splijtzijde/"
BREIBRINK_DMC_AJAX = f"{BREIBRINK_DMC_URL}page{{page}}.ajax"
THREADCOLORS_URL = "https://threadcolors.com/"
BAMBU_SITEMAP_URL = "https://eu.store.bambulab.com/sitemap_products_1.xml"
BREIBRINK_DMC_ALIASES = {"BLANC": "WHITE"}
DEFAULT_SWATCH = "#D8D6D0"
MIN_BAMBU_ENTRIES = 250
MIN_DMC_COLORS = 400
MIN_BREIBRINK_LINKS = 400
RETRYABLE_HTTP_STATUS = {429, 500, 502, 503, 504}

# Permanent baseline of Bambu filament families. The updater never removes one
# just because a regional storefront hides it or every variant is sold out.
# The product sitemap is merged into this registry so newly published families
# matching the family-name rules below can be picked up automatically.
BAMBU_FAMILIES = {
    "abs-filament": "ABS",
    "abs-gf": "ABS-GF",
    "asa-aero": "ASA Aero",
    "asa-cf": "ASA-CF",
    "asa-filament": "ASA",
    "pa6-cf": "PA6-CF",
    "pa6-gf": "PA6-GF",
    "paht-cf": "PAHT-CF",
    "pc-filament": "PC",
    "pc-fr": "PC FR",
    "pet-cf": "PET-CF",
    "petg-basic": "PETG Basic",
    "petg-cf": "PETG-CF",
    "petg-hf": "PETG HF",
    "petg-translucent": "PETG Translucent",
    "pla-aero": "PLA Aero",
    "pla-basic-filament": "PLA Basic",
    "pla-basic-gradient": "PLA Basic Gradient",
    "pla-cf": "PLA-CF",
    "pla-cmyk-lithophane": "PLA CMYK Lithophane",
    "pla-galaxy": "PLA Galaxy",
    "pla-glow": "PLA Glow",
    "pla-marble": "PLA Marble",
    "pla-matte": "PLA Matte",
    "pla-metal": "PLA Metal",
    "pla-pure": "PLA Pure",
    "pla-silk-multi-color": "PLA Silk Multi-Color",
    "pla-silk-upgrade": "PLA Silk+",
    "pla-sparkle": "PLA Sparkle",
    "pla-tough-upgrade": "PLA Tough+",
    "pla-translucent": "PLA Translucent",
    "pla-wood": "PLA Wood",
    "ppa-cf": "PPA-CF",
    "pps-cf": "PPS-CF",
    "pva": "PVA",
    "support-for-abs": "Support for ABS",
    "support-for-pa-pet": "Support for PA/PET",
    "support-for-pla-new": "Support for PLA (New Version)",
    "support-for-pla-petg": "Support for PLA/PETG",
    "tpu-85a-tpu-90a": "TPU 85A / TPU 90A",
    "tpu-95a-hf": "TPU 95A HF",
    "tpu-for-ams": "TPU for AMS",
}

BAMBU_FAMILY_PREFIXES = (
    "ABS",
    "ASA",
    "PA6",
    "PAHT",
    "PC",
    "PET-CF",
    "PETG",
    "PLA",
    "PPA",
    "PPS",
    "PVA",
    "Support for",
    "TPU",
)
BAMBU_NON_FAMILY_HANDLE_PARTS = ("bundle", "pack", "starter", "trial-set", "swatch", "module", "connector")


def warn(message: str) -> None:
    print(f"Warning: {message}", file=sys.stderr)


def read_entries(path: Path) -> list:
    return json.loads(path.read_text()).get("entries", []) if path.exists() else []


def fetch(url: str, attempts: int = 4) -> bytes:
    for attempt in range(attempts):
        request = urllib.request.Request(url, headers={"User-Agent": "DoneIshCatalogSnapshot/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code not in RETRYABLE_HTTP_STATUS or attempt == attempts - 1:
                raise
            retry_after = error.headers.get("Retry-After", "")
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
            retry_after = ""
        time.sleep(float(retry_after) if retry_after.isdigit() else 2 ** (attempt + 1))
    raise RuntimeError(f"Could not fetch {url}")


def fetch_json(url: str) -> dict:
    return json.loads(fetch(url))


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


class BambuVariantParser(HTMLParser):
    """Pair each Bambu colour option with the swatch image nested inside it."""

    def __init__(self, page_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.page_url = page_url
        self.current = None
        self.variants = []

    def handle_starttag(self, tag: str, attributes: list) -> None:
        attrs = dict(attributes)
        if tag == "li":
            match = re.fullmatch(r"(.+?)\s*\((\d{4,6})\)", attrs.get("value", "").strip())
            self.current = [*match.groups(), ""] if match else None
        elif tag == "img" and self.current and not self.current[2]:
            source = attrs.get("src") or attrs.get("data-src")
            if source:
                self.current[2] = urljoin(self.page_url, source)

    def handle_endtag(self, tag: str) -> None:
        if tag == "li" and self.current:
            self.variants.append(tuple(self.current))
            self.current = None


def parse_bambu_variants(page: str, page_url: str) -> list:
    parser = BambuVariantParser(page_url)
    parser.feed(page)
    variants = {}
    for color, product_code, swatch in parser.variants:
        key = (color, product_code)
        if key not in variants or swatch:
            variants[key] = (color, product_code, swatch)
    return list(variants.values())


def bambu_listing(handle: str, family: str) -> dict:
    return {
        "id": f"bambu-{slug(handle)}",
        "family": family,
        "color": "Catalog listing",
        "productCode": "",
        "swatch": DEFAULT_SWATCH,
    }


class ThreadcolorsParser(HTMLParser):
    """Read the canonical DMC number, name, and hex value table."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_table = False
        self.row = None
        self.cell = None
        self.threads = {}

    def handle_starttag(self, tag: str, attributes: list) -> None:
        attrs = dict(attributes)
        if tag == "table" and attrs.get("id") == "closest-colors":
            self.in_table = True
        elif self.in_table and tag == "tr":
            self.row = []
        elif self.row is not None and tag == "td":
            self.cell = []

    def handle_data(self, data: str) -> None:
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "td" and self.cell is not None and self.row is not None:
            self.row.append("".join(self.cell).strip())
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if len(self.row) >= 7 and re.fullmatch(r"[0-9a-fA-F]{6}", self.row[6]):
                number = self.row[1]
                self.threads[number.upper()] = {
                    "number": number,
                    "colorName": self.row[2],
                    "color": f"#{self.row[6].upper()}",
                }
            self.row = None
        elif tag == "table" and self.in_table:
            self.in_table = False


def parse_threadcolors(document: bytes) -> dict:
    parser = ThreadcolorsParser()
    parser.feed(document.decode("utf-8", "replace"))
    return parser.threads


def bambu_sitemap_families(document: bytes) -> dict:
    namespace = {
        "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
        "image": "http://www.google.com/schemas/sitemap-image/1.1",
    }
    discovered = {}
    for node in ET.fromstring(document).findall("sm:url", namespace):
        location = node.findtext("sm:loc", "", namespace)
        match = re.fullmatch(r"https://eu\.store\.bambulab\.com/products/([a-z0-9-]+)", location)
        if not match:
            continue
        handle = match.group(1)
        caption = html.unescape(node.findtext("image:image/image:caption", "", namespace)).strip()
        is_filament = caption.startswith(BAMBU_FAMILY_PREFIXES)
        is_multipack = any(part in handle for part in BAMBU_NON_FAMILY_HANDLE_PARTS)
        if is_filament and not is_multipack:
            discovered[handle] = caption.removesuffix(" Bundle")
    return discovered


def parse_bambu_product(handle: str, family: str, previous_entries: list) -> list:
    url = f"https://eu.store.bambulab.com/products/{handle}"
    try:
        page = fetch(url, attempts=2).decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError) as error:
        warn(f"Bambu {family} could not be fetched; preserving its previous rows ({error})")
        return previous_entries or [bambu_listing(handle, family)]

    variants = parse_bambu_variants(page, url)
    if not variants:
        warn(f"Bambu {family} returned no variants; preserving its previous rows")
        return previous_entries or [bambu_listing(handle, family)]
    previous_swatches = {entry["productCode"]: entry.get("swatch", "") for entry in previous_entries}
    return [
        {
            "id": f"bambu-{slug(handle)}-{product_code}",
            "family": family,
            "color": color,
            "productCode": product_code,
            "swatch": image or previous_swatches.get(product_code) or DEFAULT_SWATCH,
        }
        for color, product_code, image in variants
    ]


def parse_bambu() -> dict:
    try:
        sitemap_families = bambu_sitemap_families(fetch(BAMBU_SITEMAP_URL))
    except (urllib.error.URLError, TimeoutError, ET.ParseError) as error:
        warn(f"Bambu sitemap could not be refreshed; using the baseline family list ({error})")
        sitemap_families = {}
    families = {**sitemap_families, **BAMBU_FAMILIES}
    previous_entries = read_entries(BAMBU_SNAPSHOT_PATH)
    previous_by_family = {}
    for entry in previous_entries:
        previous_by_family.setdefault(entry["family"], []).append(entry)
    entries = []
    # Bambu throttles even small concurrent batches. Sequential requests are
    # faster in practice because they avoid repeated 429 backoff cycles.
    for handle, family in families.items():
        entries.extend(parse_bambu_product(handle, family, previous_by_family.get(family, [])))
    entries.sort(key=lambda item: (item["family"], item["color"], item["productCode"]))
    if len(entries) < MIN_BAMBU_ENTRIES:
        message = f"Bambu refresh produced only {len(entries)} rows"
        if len(previous_entries) >= MIN_BAMBU_ENTRIES:
            warn(f"{message}; preserving the previous snapshot")
            return {"entries": previous_entries}
        raise RuntimeError(f"{message} and no complete previous snapshot exists")
    return {"entries": entries}


def parse_breibrink_links() -> dict:
    first_page = fetch_json(BREIBRINK_DMC_AJAX.format(page=1))
    products = list(first_page["products"])
    page_urls = [BREIBRINK_DMC_AJAX.format(page=page) for page in range(2, int(first_page["pages"]) + 1)]
    with ThreadPoolExecutor(max_workers=4) as executor:
        for page in executor.map(fetch_json, page_urls):
            products.extend(page["products"])

    links = {}
    for product in products:
        title = product.get("title", "").strip()
        match = re.match(r"DMC splijtzijde\s+([A-Za-z0-9]+)(?:\s|/|$)", title, re.IGNORECASE)
        if match:
            number = BREIBRINK_DMC_ALIASES.get(match.group(1).upper(), match.group(1).upper())
            links[number] = product.get("url", BREIBRINK_DMC_URL)
    return links


def parse_dmc() -> dict:
    previous_entries = read_entries(DMC_SNAPSHOT_PATH)
    previous_links = {
        str(entry.get("number", "")).upper(): entry["link"] for entry in previous_entries if entry.get("link")
    }

    try:
        threads = parse_threadcolors(fetch(THREADCOLORS_URL))
        if len(threads) < MIN_DMC_COLORS:
            raise ValueError(f"Threadcolors returned only {len(threads)} DMC rows")
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        if not previous_entries:
            raise RuntimeError("Threadcolors failed and no previous DMC snapshot exists") from error
        warn(f"Threadcolors could not be refreshed; preserving the previous DMC snapshot ({error})")
        return {"entries": previous_entries}

    try:
        breibrink_links = parse_breibrink_links()
        if len(breibrink_links) < MIN_BREIBRINK_LINKS:
            raise ValueError(f"Breibrink returned only {len(breibrink_links)} product links")
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        warn(f"Breibrink links could not be refreshed; preserving previous links ({error})")
        breibrink_links = previous_links

    entries = []
    for key, thread in threads.items():
        entry = dict(thread)
        link = breibrink_links.get(key) or previous_links.get(key)
        if link:
            entry["link"] = link
        entries.append(entry)
    return {"entries": entries}


def write_snapshots(bambu: dict, dmc: dict) -> None:
    CATALOG_DIR.mkdir(parents=True, exist_ok=True)
    snapshots = ((BAMBU_SNAPSHOT_PATH, bambu), (DMC_SNAPSHOT_PATH, dmc))
    temporary_paths = []
    try:
        for path, payload in snapshots:
            temporary_path = path.with_suffix(f"{path.suffix}.tmp")
            temporary_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
            temporary_paths.append((temporary_path, path))
        for temporary_path, path in temporary_paths:
            temporary_path.replace(path)
    finally:
        for temporary_path, _ in temporary_paths:
            temporary_path.unlink(missing_ok=True)


def main() -> None:
    bambu = parse_bambu()
    dmc = parse_dmc()
    write_snapshots(bambu, dmc)
    print(
        f"Updated {CATALOG_DIR.relative_to(ROOT)}: "
        f"Bambu {len(bambu['entries'])} entries; DMC {len(dmc['entries'])} entries"
    )


if __name__ == "__main__":
    main()
