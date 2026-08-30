#!/usr/bin/env python3
"""
Create a window sign with 6-inch tall black text on transparent background.
The image is cropped tightly to fit the text with padding.
Usage: python create_window_signs.py "KIDS"
"""

from PIL import Image, ImageDraw, ImageFont
import sys
import os

# Font path - change this to match your font location
FONT_PATH = "/home/arjan-ubuntu/Documents/keep-on-truckin/KEEPT___.TTF"


def inches_to_pixels(inches, dpi=300):
    """Convert inches to pixels"""
    return int(inches * dpi)


def create_sign(text):
    """
    Create a sign with 6-inch tall black text on transparent background.
    Image is cropped tightly to fit the text with padding.
    
    Args:
        text: The text to display on the sign
    """
    if not text:
        print("❌ Error: Please provide text for the sign")
        print("Usage: python create_window_signs.py \"YOUR TEXT\"")
        sys.exit(1)
    
    dpi = 300
    
    # Target text height: 6 inches
    text_height_px = inches_to_pixels(6, dpi)
    
    # Load the font
    try:
        font = ImageFont.truetype(FONT_PATH, text_height_px)
        print(f"✅ Loaded font: {FONT_PATH}")
    except Exception as e:
        print(f"⚠️  Could not load font: {e}")
        print("   Using default font instead")
        font = ImageFont.load_default()
        text_height_px = 60
    
    # Get the font metrics properly
    # Create a temporary image to measure text
    temp_image = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    temp_draw = ImageDraw.Draw(temp_image)
    
    # Get the full bounding box including ascent/descent
    # Using textbbox with anchor 'la' (left baseline) gives us the baseline position
    bbox = temp_draw.textbbox((0, 0), text, font=font)
    
    # bbox = (left, top, right, bottom)
    text_left = bbox[0]
    text_top = bbox[1]  # This is the ascent (negative for most fonts)
    text_right = bbox[2]
    text_bottom = bbox[3]  # This is the descent
    
    # Calculate actual text dimensions
    text_width = text_right - text_left
    text_height = text_bottom - text_top
    
    print(f"📝 Text: '{text}'")
    print(f"📏 Text dimensions: {text_width} x {text_height} pixels")
    print(f"   Left: {text_left}, Top: {text_top}, Right: {text_right}, Bottom: {text_bottom}")
    
    # Add padding around the text (in inches)
    padding_inches = 2
    padding_px = inches_to_pixels(padding_inches, dpi)
    
    # Calculate final image size with padding
    image_width = text_width + (padding_px * 2)
    image_height = text_height + (padding_px * 2)
    
    # Create the actual image with transparent background
    image = Image.new("RGBA", (image_width, image_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    
    # Position the text with padding, offset by the top (ascent) value
    # The top value is negative, so we add it to move the text down correctly
    x = padding_px - text_left
    y = padding_px - text_top
    
    # Draw the text in BLACK
    draw.text((x, y), text, fill="black", font=font)
    
    # Generate output filename
    output_file = f"{text.replace(' ', '_')}_sign.png"
    
    # Save the image
    image.save(output_file, "PNG", dpi=(dpi, dpi))
    
    print(f"✅ Sign saved: {output_file}")
    print(f"   Image size: {image_width} x {image_height} pixels")
    print(f"   Image size: {image_width/dpi:.1f}\" x {image_height/dpi:.1f}\"")
    print(f"   Padding: {padding_inches}\" on all sides")
    print("   Background: Transparent")
    print("   Text color: Black")
    print(f"   File size: {os.path.getsize(output_file) / 1024:.1f} KB")
    
    return output_file


if __name__ == "__main__":
    # Get text from command line argument
    if len(sys.argv) < 2:
        print("❌ Error: Please provide text for the sign")
        print("Usage: python create_window_signs.py \"YOUR TEXT\"")
        print("Examples:")
        print("  python create_window_signs.py \"KIDS\"")
        print("  python create_window_signs.py \"RECORDS\"")
        print("  python create_window_signs.py \"SALE 50% OFF\"")
        sys.exit(1)
    
    text = sys.argv[1]
    create_sign(text)