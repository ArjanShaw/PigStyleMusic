from PIL import Image, ImageDraw, ImageFont
import sys

font_path = "/home/arjan-ubuntu/Documents/keep-on-truckin/KEEPT___.TTF"


def inches_to_pixels(inches, dpi=300):
    return int(inches * dpi)


def fit_text(draw, text, font_path, max_width, max_height, start_size=500):
    """
    Width-first scaling:
    - maximize usage of horizontal space
    - then adjust if height overflows
    """

    # Start large
    font = ImageFont.truetype(font_path, start_size)
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]

    # Scale to fill width
    scale = max_width / w
    new_size = max(10, int(start_size * scale))

    font = ImageFont.truetype(font_path, new_size)
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]

    # If height is too big, scale down
    if h > max_height:
        scale = max_height / h
        new_size = max(10, int(new_size * scale))
        font = ImageFont.truetype(font_path, new_size)

        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]

    return font, w, h


def create_designed_sign():
    dpi = 300
    page_w = inches_to_pixels(36, dpi)
    page_h = inches_to_pixels(48, dpi)
    margin = inches_to_pixels(1.5, dpi)

    image = Image.new("RGB", (page_w, page_h), "white")
    draw = ImageDraw.Draw(image)

    usable_w = page_w - 2 * margin
    usable_h = page_h - 2 * margin

    # Layout zones
    top_h = int(usable_h * 0.25)
    middle_h = int(usable_h * 0.4)
    bottom_h = int(usable_h * 0.25)

    # --- TEXT ---
    top_text = "STORE MADE"
    middle_text = "FREE TOTES"
    bottom_text = "WITH 5+ ITEMS"

    # --- FIT TEXT (now width-maximizing) ---
    top_font, top_w, top_h_actual = fit_text(draw, top_text, font_path, usable_w, top_h, 400)
    mid_font, mid_w, mid_h_actual = fit_text(draw, middle_text, font_path, usable_w, middle_h, 700)
    bot_font, bot_w, bot_h_actual = fit_text(draw, bottom_text, font_path, usable_w, bottom_h, 350)

    # --- DRAW ---
    y = margin

    # Top
    x = (page_w - top_w) // 2
    draw.text((x, y), top_text, fill="black", font=top_font)
    y += top_h

    # Middle (hero)
    x = (page_w - mid_w) // 2
    draw.text((x, y), middle_text, fill="black", font=mid_font)
    y += middle_h

    # Bottom
    x = (page_w - bot_w) // 2
    draw.text((x, y), bottom_text, fill="black", font=bot_font)

    # Border
    border_thickness = 20
    draw.rectangle(
        [border_thickness, border_thickness,
         page_w - border_thickness,
         page_h - border_thickness],
        outline="black",
        width=border_thickness
    )

    filename = "/home/arjan-ubuntu/Documents/store_totes_poster.png"
    image.save(filename, "PNG", dpi=(dpi, dpi))

    print(f"Saved: {filename}")


if __name__ == "__main__":
    create_designed_sign()