
#!/usr/bin/env python3
"""Create a 2 x 4 inch PigStyle review receipt graphic."""

from PIL import Image, ImageDraw, ImageFont
import os

FONT_PATH = "/home/arjan-ubuntu/Documents/keep-on-truckin/KEEPT___.TTF"
QR_PATH = "/home/arjan-ubuntu/Documents/PigStyleMusic/website/images/qr-code-review.png"
OUTPUT_FILE = "pigstyle_review_receipt.png"

DPI = 300
WIDTH = 2 * DPI
HEIGHT = 4 * DPI

# Black text on white background for receipt printing
image = Image.new("RGB", (WIDTH, HEIGHT), "white")
draw = ImageDraw.Draw(image)


def load_font(size):
    return ImageFont.truetype(FONT_PATH, size)


def centered_text(text, y, size):
    font = load_font(size)
    draw.text(
        (WIDTH // 2, y),
        text,
        font=font,
        fill="black",
        anchor="mm",
        align="center",
    )


# PigStyle review message
centered_text("PIGSTYLE", 105, 76)
centered_text("ENJOYING YOUR", 235, 43)
centered_text("RECORDS?", 295, 54)

centered_text("PLEASE LEAVE", 400, 43)
centered_text("A REVIEW!", 460, 55)

# Add the existing QR code
if os.path.exists(QR_PATH):
    qr = Image.open(QR_PATH).convert("RGB")

    # Keep the entire QR code, including its quiet zone
    qr.thumbnail((360, 360), Image.Resampling.LANCZOS)

    qr_x = (WIDTH - qr.width) // 2
    qr_y = 540 + (360 - qr.height) // 2

    # White backing helps the QR code scan reliably
    draw.rectangle(
        [qr_x - 12, qr_y - 12,
         qr_x + qr.width + 12, qr_y + qr.height + 12],
        fill="white",
    )
    image.paste(qr, (qr_x, qr_y))
else:
    centered_text("SCAN QR CODE", 700, 38)
    centered_text("HERE", 755, 38)
    print(f"WARNING: QR code not found: {QR_PATH}")

centered_text("THANKS FOR", 990, 42)
centered_text("SUPPORTING", 1045, 42)
centered_text("INDEPENDENT", 1100, 42)
centered_text("RECORD STORES!", 1155, 42)

image.save(OUTPUT_FILE, dpi=(DPI, DPI))

print(f"Saved: {os.path.abspath(OUTPUT_FILE)}")
print(f"Physical size: {WIDTH / DPI:.0f} x {HEIGHT / DPI:.0f} inches")
print(f"Resolution: {WIDTH} x {HEIGHT} pixels")
