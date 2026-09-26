"""Platter's server, tested without spending anything: pages and assets, the import endpoint's guard against
reaching private addresses, every AI endpoint's input checks (with no AI key, so no AI call is made), prices for
the US (which need no AI), the diet-label check, and the recipe library's integrity.

    python -m unittest discover tests
"""

import gzip
import json
import os
import re
import sys
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.chdir(ROOT)

import ai  # noqa: E402
from app import app  # noqa: E402


class Pages(unittest.TestCase):
    def setUp(self):
        self.c = app.test_client()

    def test_home_page_links_every_script(self):
        page = self.c.get("/").get_data(as_text=True)
        for name in os.listdir(os.path.join(ROOT, "static", "js")):
            self.assertIn(f"js/{name}", page, f"{name} is not loaded by the page")
        for css in ("style.css", "dark.css", "white.css"):
            self.assertIn(css, page)

    def test_library_is_served_gzipped_with_an_etag(self):
        r = self.c.get("/static/data/library.json", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers.get("Content-Encoding"), "gzip")
        self.assertTrue(r.headers.get("ETag"))
        self.assertIn("recipes", json.loads(gzip.decompress(r.data)))
        again = self.c.get("/static/data/library.json", headers={"If-None-Match": r.headers["ETag"]})
        self.assertEqual(again.status_code, 304)

    def test_library_prefers_brotli_when_the_browser_takes_it(self):
        import brotli
        r = self.c.get("/static/data/library.json", headers={"Accept-Encoding": "gzip, deflate, br"})
        self.assertEqual(r.headers.get("Content-Encoding"), "br")
        self.assertIn("recipes", json.loads(brotli.decompress(r.data)))
        plain = self.c.get("/static/data/library.json", headers={"Accept-Encoding": "identity"})
        self.assertIsNone(plain.headers.get("Content-Encoding"))
        self.assertIn("recipes", json.loads(plain.data))

    def test_page_has_a_strict_policy_and_its_one_inline_script_is_allowed(self):
        r = self.c.get("/")
        csp = r.headers.get("Content-Security-Policy", "")
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertIn("object-src 'none'", csp)
        self.assertNotIn("unsafe-eval", csp)
        nonce = re.search(r"'nonce-([^']+)'", csp).group(1)
        page = r.get_data(as_text=True)
        inline = re.findall(r"<script(?![^>]*\bsrc=)([^>]*)>", page)
        self.assertTrue(inline)
        for attrs in inline:
            self.assertIn(f'nonce="{nonce}"', attrs)
        self.assertNotEqual(nonce, re.search(r"'nonce-([^']+)'", self.c.get("/").headers["Content-Security-Policy"]).group(1))
        self.assertEqual(r.headers.get("X-Frame-Options"), "DENY")
        self.assertIn("camera=(self)", r.headers.get("Permissions-Policy", ""))
        self.assertIn("microphone=(self)", r.headers.get("Permissions-Policy", ""))

    def test_service_worker_is_never_cached_hard(self):
        r = self.c.get("/sw.js")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers.get("Cache-Control"), "no-cache")

    def test_missing_static_file_is_404_not_500(self):
        self.assertEqual(self.c.get("/static/nope.js").status_code, 404)
        self.assertEqual(self.c.get("/static/../app.py").status_code, 404)


class Import(unittest.TestCase):
    def setUp(self):
        self.c = app.test_client()

    def test_rejects_non_http_and_private_addresses(self):
        for url in ("ftp://example.com/x", "not a url", "http://127.0.0.1:5075/", "http://localhost/", "http://169.254.169.254/latest"):
            r = self.c.post("/api/import", json={"url": url})
            self.assertEqual(r.status_code, 400, url)


class AIWithoutAKey(unittest.TestCase):
    """With no key the AI endpoints must say so (or reject bad input first), never crash or call out."""

    def setUp(self):
        self.c = app.test_client()
        self.env = mock.patch.dict(os.environ, {"OPENAI_API_KEY": ""})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_status_says_off(self):
        self.assertEqual(self.c.get("/api/ai/status").get_json()["enabled"], False)

    def test_bad_input_is_400(self):
        for path in ("/api/ai/ideas", "/api/ai/recipe", "/api/ai/ask", "/api/ai/remix", "/api/ai/extract", "/api/ai/fridge", "/api/ai/translate"):
            self.assertEqual(self.c.post(path, json={}).status_code, 400, path)

    def test_good_input_without_a_key_is_503_off(self):
        calls = {
            "/api/ai/ideas": {"query": "pasta"},
            "/api/ai/recipe": {"title": "Pasta"},
            "/api/ai/ask": {"q": "why?", "recipe": {"title": "Pasta", "ing": ["pasta"]}},
            "/api/ai/remix": {"how": "vegetarian", "recipe": {"title": "Pasta", "ing": ["pasta"]}},
            "/api/ai/translate": {"lang": "ar", "recipe": {"title": "Pasta", "ing": ["pasta"]}},
        }
        for path, body in calls.items():
            r = self.c.post(path, json=body)
            self.assertEqual(r.status_code, 503, path)
            self.assertEqual(r.get_json().get("code"), "off", path)

    def test_a_fake_photo_is_refused_before_any_ai(self):
        r = self.c.post("/api/ai/fridge", json={"image": "data:text/html;base64,PHNjcmlwdD4="})
        self.assertEqual(r.status_code, 400)


class Prices(unittest.TestCase):
    def test_us_prices_need_no_ai(self):
        r = app.test_client().post("/api/prices", json={"country": "US"})
        d = r.get_json()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(d["currency"], "USD")
        self.assertTrue(all(v == 1 for v in d["mult"].values()))

    def test_country_is_required(self):
        self.assertEqual(app.test_client().post("/api/prices", json={}).status_code, 400)


class DietLabels(unittest.TestCase):
    def test_ingredients_veto_wrong_labels(self):
        self.assertEqual(ai.diet_labels(["vegetarian"], ["2 tbsp fish sauce", "rice"]), [])
        self.assertEqual(ai.diet_labels(["dairy-free"], ["1 can coconut milk"]), ["dairy-free"])
        self.assertEqual(ai.diet_labels(["dairy-free"], ["2 tbsp butter"]), [])
        self.assertEqual(ai.diet_labels(["vegan"], ["tofu", "rice"]), ["vegetarian", "vegan"])
        self.assertEqual(ai.diet_labels(["gluten-free"], ["200g rice noodles"]), ["gluten-free"])
        self.assertEqual(ai.diet_labels(["gluten-free"], ["2 tbsp soy sauce"]), [])


class Library(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(ROOT, "static", "data", "library.json"), encoding="utf-8") as fh:
            cls.lib = json.load(fh)
        with open(os.path.join(ROOT, "static", "data", "details.json"), encoding="utf-8") as fh:
            cls.details = json.load(fh)

    def test_every_recipe_is_whole(self):
        tags = {t["id"] for t in self.lib["tags"]}
        ids = set()
        for r in self.lib["recipes"]:
            self.assertNotIn(r["id"], ids, f"duplicate id {r['id']}")
            ids.add(r["id"])
            self.assertIn(r["tag"], tags, r["title"])
            self.assertTrue(r["title"] and r["ing"] and r["steps"], r["title"])
            self.assertTrue(r["img"].startswith("https://"), r["title"])
            if "cost" in r:
                self.assertEqual(len(r["cost"]), len(r["ing"]), f"{r['title']}: costs don't line up with ingredients")
            if "nut" in r:
                self.assertEqual(len(r["nut"]), 4, r["title"])

    def test_every_tag_has_a_cover_that_exists(self):
        ids = {r["id"] for r in self.lib["recipes"]}
        for t in self.lib["tags"]:
            self.assertIn(t["cover"], ids, t["name"])

    def test_details_belong_to_real_recipes(self):
        ids = {r["id"] for r in self.lib["recipes"]}
        self.assertFalse(set(self.details) - ids)

    def test_no_two_recipes_share_a_photo(self):
        seen = {}
        for r in self.lib["recipes"]:
            key = r["img"].split("?")[0]
            self.assertNotIn(key, seen, f"{r['title']} and {seen.get(key)} share a photo")
            seen[key] = r["title"]


if __name__ == "__main__":
    unittest.main()
