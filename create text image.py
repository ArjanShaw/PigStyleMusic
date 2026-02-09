from PIL import Image, ImageDraw, ImageFont
import os

# Path to your TTF font
font_path = "/home/arjan-ubuntu/Documents/keep-on-truckin/KEEPT___.TTF"

# Function to create text image with transparent background
def create_text_image(text, font_size, color, filename):
    # Load font
    try:
        font = ImageFont.truetype(font_path, font_size)
    except IOError:
        print(f"Error: Could not load font from {font_path}")
        exit(1)

    # Calculate text dimensions
    try:
        # Create temporary drawing to measure text
        temp_img = Image.new('RGBA', (1, 1), (0, 0, 0, 0))
        temp_draw = ImageDraw.Draw(temp_img)
        text_bbox = temp_draw.textbbox((0, 0), text, font=font)
        text_width = text_bbox[2] - text_bbox[0]
        text_height = text_bbox[3] - text_bbox[1]
    except Exception as e:
        print(f"Error measuring text: {e}")
        # Use estimated dimensions
        text_width = len(text) * font_size // 2
        text_height = font_size

    # Add margins
    margin = 50
    img_width = text_width + 2 * margin
    img_height = text_height + 2 * margin

    # Create image with transparent background
    image = Image.new('RGBA', (img_width, img_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Draw text
    x = margin
    y = margin
    draw.text((x, y), text, font=font, fill=color)

    # Save as PNG
    image.save(filename, 'PNG')
    print(f"PNG created: {filename}")
    return image

# Create "Loveland's Coolest Record Store" in red
create_text_image(
    text="Loveland's Coolest Record Store",
    font_size=72,
    color=(255, 0, 0, 255),  # Red
    filename="/home/arjan-ubuntu/Documents/loveland_record_store.png"
)

# Create "PigStyle" in light green (twice the size)
create_text_image(
    text="PigStyle",
    font_size=144,  # Twice the size of 72
    color=(144, 238, 144, 255),  # Light green (RGB: 144, 238, 144)
    filename="/home/arjan-ubuntu/Documents/pigstyle_text_custom.png"
)