#!/usr/bin/env python3
"""
Create a self-contained PDF with ONE image per page, scaled as large
as possible while preserving the original 5:6 (800x960) aspect ratio.
"""

import os
import sys
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

# --- Configuration ---
IMAGE_PATH  = "/home/arjan-ubuntu/Documents/PigStyleMusic/website/images/kosmo oct 40.jpg"
OUTPUT_PDF  = "/home/arjan-ubuntu/Documents/PigStyleMusic/website/handouts_fullpage.pdf"

# The image is 800 x 960 => 5:6. Never break this ratio.
ASPECT_W, ASPECT_H = 5, 6

PAGE_SIZE       = letter     # letter or A4
PAGE_MARGIN_IN  = 0.0        # set e.g. 0.25 for a small border around each page
TOTAL_PAGES     = 8          # how many copies you want in the PDF


def main():
    if not os.path.isfile(IMAGE_PATH):
        sys.exit(f"Image not found: {IMAGE_PATH}")

    page_w, page_h = PAGE_SIZE
    usable_w = page_w - 2 * PAGE_MARGIN_IN * inch
    usable_h = page_h - 2 * PAGE_MARGIN_IN * inch

    # Fit the image into the usable area, preserving aspect ratio.
    scale = min(usable_w / ASPECT_W, usable_h / ASPECT_H)
    img_w = ASPECT_W * scale
    img_h = ASPECT_H * scale

    # Center it on the page.
    x = (page_w - img_w) / 2
    y = (page_h - img_h) / 2

    print(f"Page size     : {page_w/inch:.2f}\" x {page_h/inch:.2f}\"")
    print(f"Image on page : {img_w/inch:.2f}\" x {img_h/inch:.2f}\"  (ratio {ASPECT_W}:{ASPECT_H})")
    print(f"Pages         : {TOTAL_PAGES}")

    img = ImageReader(IMAGE_PATH)
    c = canvas.Canvas(OUTPUT_PDF, pagesize=PAGE_SIZE)

    for _ in range(TOTAL_PAGES):
        c.drawImage(img, x, y, width=img_w, height=img_h,
                    preserveAspectRatio=True, anchor='c')
        c.showPage()

    c.save()
    print(f"\nWrote: {OUTPUT_PDF}")
    print("Self-contained — copy it anywhere and it will print fine.")


if __name__ == "__main__":
    main()