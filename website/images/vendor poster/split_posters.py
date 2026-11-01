#!/usr/bin/env python3
"""
Split an 8ft wide x 4ft tall (landscape) image into 6 printable posters.

Layout:
  ┌──────────┬──────────┬────────┐
  │  LT 3x2  │  CT 3x2  │ RT 2x2 │
  ├──────────┼──────────┼────────┤
  │  LB 3x2  │  CB 3x2  │ RB 2x2 │
  └──────────┴──────────┴────────┘
"""

from PIL import Image
import os

# --- Configuration ---
IMAGE_PATH = "/home/arjan-ubuntu/Documents/PigStyleMusic/website/images/Psychedelic PigStyle Record Poster.png"
OUTPUT_DIR = "/home/arjan-ubuntu/Documents/PigStyleMusic/website/images/posters"

TOTAL_WIDTH_FT  = 8
TOTAL_HEIGHT_FT = 4

PRINT_DPI = 300

# (name, x0_ft, y0_ft, x1_ft, y1_ft)
POSTERS = [
    ("poster_1_left_top_3x2",     0, 0, 3, 2),
    ("poster_2_center_top_3x2",   3, 0, 6, 2),
    ("poster_3_right_top_2x2",    6, 0, 8, 2),
    ("poster_4_left_bottom_3x2",  0, 2, 3, 4),
    ("poster_5_center_bottom_3x2",3, 2, 6, 4),
    ("poster_6_right_bottom_2x2", 6, 2, 8, 4),
]

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    img = Image.open(IMAGE_PATH)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    W, H = img.size
    print(f"Loaded image: {W}x{H}px  aspect={W/H:.4f}  "
          f"(expected {TOTAL_WIDTH_FT/TOTAL_HEIGHT_FT:.4f})")

    resample = getattr(Image, "LANCZOS", Image.BICUBIC)

    for name, x0_ft, y0_ft, x1_ft, y1_ft in POSTERS:
        px0 = int(round(x0_ft / TOTAL_WIDTH_FT  * W))
        px1 = int(round(x1_ft / TOTAL_WIDTH_FT  * W))
        py0 = int(round(y0_ft / TOTAL_HEIGHT_FT * H))
        py1 = int(round(y1_ft / TOTAL_HEIGHT_FT * H))
        px0, px1 = max(0, px0), min(W, px1)
        py0, py1 = max(0, py0), min(H, py1)

        crop = img.crop((px0, py0, px1, py1))

        width_in  = (x1_ft - x0_ft) * 12
        height_in = (y1_ft - y0_ft) * 12
        target_px = (int(round(width_in  * PRINT_DPI)),
                     int(round(height_in * PRINT_DPI)))

        crop_print = crop.resize(target_px, resample)
        out_path = os.path.join(OUTPUT_DIR, f"{name}.png")
        crop_print.save(out_path, dpi=(PRINT_DPI, PRINT_DPI))

        print(f"  {name}.png  ->  {width_in:.0f}x{height_in:.0f}in  "
              f"({target_px[0]}x{target_px[1]}px @ {PRINT_DPI}dpi)")

    print("\nDone! Files in:", OUTPUT_DIR)

if __name__ == "__main__":
    main()
