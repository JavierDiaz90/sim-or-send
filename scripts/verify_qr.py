#!/usr/bin/env python3
"""Verify js/qr.js module-for-module against the python `qrcode` reference library.

Usage: python3 scripts/verify_qr.py
Requires: pip3 install qrcode  (and node on PATH)
"""
import json
import subprocess
import sys

import qrcode

SAMPLES = [
    "https://docs.enso.build",
    "https://enso.build/quote-simulator?src=stand",
    "HELLO",
    "https://example.com/a/fairly/long/path/that/pushes/into/version/four?x=1",
]

NODE_SNIPPET = """
const QR = require('./js/qr.js');
const m = QR.encode(process.env.QR_TEXT);
console.log(JSON.stringify(m.map(row => row.map(v => v ? 1 : 0))));
"""

failures = 0
for text in SAMPLES:
    res = subprocess.run(
        ["node", "-e", NODE_SNIPPET],
        capture_output=True, text=True, cwd=sys.path[0] + "/..",
        env={"PATH": "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin", "QR_TEXT": text},
    )
    if res.returncode != 0:
        print(f"FAIL {text!r}: node error\n{res.stderr}")
        failures += 1
        continue
    ours = json.loads(res.stdout)

    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        mask_pattern=0,
        border=0,
    )
    # js/qr.js always encodes in byte mode; force the same in the reference
    # (the library would otherwise pick alphanumeric for e.g. pure-uppercase text).
    qr.add_data(qrcode.util.QRData(text.encode(), mode=qrcode.util.MODE_8BIT_BYTE))
    qr.make(fit=True)
    ref = [[1 if v else 0 for v in row] for row in qr.modules]

    if len(ours) != len(ref):
        print(f"FAIL {text!r}: size {len(ours)} vs reference {len(ref)} (version mismatch)")
        failures += 1
        continue
    diffs = sum(
        1 for r in range(len(ref)) for c in range(len(ref))
        if ours[r][c] != ref[r][c]
    )
    if diffs:
        print(f"FAIL {text!r}: {diffs} differing modules of {len(ref) ** 2}")
        failures += 1
    else:
        print(f"OK   {text!r}: version {(len(ref) - 17) // 4}, identical to reference")

sys.exit(1 if failures else 0)
