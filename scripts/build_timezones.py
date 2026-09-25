"""Write static/data/tz.json: which country each time zone is in, from the IANA time zone database.

The app guesses where you are from your device's time zone (Asia/Amman → JO) so prices can start in your
currency without asking for your location or looking up your IP address. Old zone names that browsers still
report (Asia/Calcutta, Europe/Kiev) are resolved through the database's "backward" links.

    python scripts/build_timezones.py
"""

import json
import os
import re

import requests

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "static", "data", "tz.json")
RAW = "https://raw.githubusercontent.com/eggert/tz/main/"


def main():
    zones = {}
    for line in requests.get(RAW + "zone.tab", timeout=20).text.splitlines():
        if line and not line.startswith("#"):
            cc, _, tz = line.split("\t")[:3]
            zones[tz] = cc
    for line in requests.get(RAW + "backward", timeout=20).text.splitlines():
        m = re.match(r"^Link\s+(\S+)\s+(\S+)", line)
        if m and m.group(1) in zones and m.group(2) not in zones:
            zones[m.group(2)] = zones[m.group(1)]
    countries = sorted({line.split("\t")[0] for line in requests.get(RAW + "iso3166.tab", timeout=20).text.splitlines()
                        if line and not line.startswith("#")})
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"zones": zones, "countries": countries}, fh, separators=(",", ":"))
    print(f"wrote {OUT}: {len(zones)} zones, {len(countries)} countries, {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
