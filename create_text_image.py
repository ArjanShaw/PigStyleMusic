from PIL import Image, ImageDraw, ImageFont
import os
import sys
import argparse
import math

# Path to your TTF font
font_path = "/home/arjan-ubuntu/Documents/PigStyleMusic/keep-on-truckin/KEEPT___.TTF"

def inches_to_pixels(inches, dpi=300):
    """Convert inches to pixels at specified DPI"""
    return int(inches * dpi)

def draw_up_arrow(draw, x, y, size, color):
    """Draw an up arrow as a polygon with padding for screws"""
    # Add padding around arrow (screw clearance)
    padding = size * 0.15  # 15% padding on each side
    
    arrow_width = size - (padding * 2)
    arrow_height = size - (padding * 2)
    
    # Center the arrow within the padded area
    arrow_x = x + padding
    arrow_y = y + padding
    
    # Polygon points for up arrow
    points = [
        (arrow_x + arrow_width/2, arrow_y),                           # Top tip
        (arrow_x + arrow_width, arrow_y + arrow_height * 0.6),        # Bottom right of arrowhead
        (arrow_x + arrow_width * 0.7, arrow_y + arrow_height * 0.6),
        (arrow_x + arrow_width * 0.7, arrow_y + arrow_height),        # Bottom right of stem
        (arrow_x + arrow_width * 0.3, arrow_y + arrow_height),        # Bottom left of stem
        (arrow_x + arrow_width * 0.3, arrow_y + arrow_height * 0.6),
        (arrow_x, arrow_y + arrow_height * 0.6),                      # Bottom left of arrowhead
    ]
    draw.polygon(points, fill=color)

def draw_down_arrow(draw, x, y, size, color):
    """Draw a down arrow as a polygon with padding for screws"""
    # Add padding around arrow (screw clearance)
    padding = size * 0.15  # 15% padding on each side
    
    arrow_width = size - (padding * 2)
    arrow_height = size - (padding * 2)
    
    # Center the arrow within the padded area
    arrow_x = x + padding
    arrow_y = y + padding
    
    # Polygon points for down arrow
    points = [
        (arrow_x + arrow_width/2, arrow_y + arrow_height),            # Bottom tip
        (arrow_x + arrow_width, arrow_y + arrow_height * 0.4),        # Top right of arrowhead
        (arrow_x + arrow_width * 0.7, arrow_y + arrow_height * 0.4),
        (arrow_x + arrow_width * 0.7, arrow_y),                       # Top right of stem
        (arrow_x + arrow_width * 0.3, arrow_y),                       # Top left of stem
        (arrow_x + arrow_width * 0.3, arrow_y + arrow_height * 0.4),
        (arrow_x, arrow_y + arrow_height * 0.4),                      # Top left of arrowhead
    ]
    draw.polygon(points, fill=color)

def create_text_image(text, font_size_inches, color, dpi=300, margin_inches=0.5):
    """
    Create text image with transparent background
    Arrows (↑ and ↓) are drawn as vector shapes with padding for screws
    """
    # Convert inches to pixels
    font_size_px = inches_to_pixels(font_size_inches, dpi)
    margin_px = inches_to_pixels(margin_inches, dpi)
    
    # Load font
    try:
        font = ImageFont.truetype(font_path, font_size_px)
    except IOError:
        print(f"Error: Could not load font from {font_path}")
        print("Looking for font... Please check path")
        sys.exit(1)

    # Create a temporary image to measure text dimensions
    temp_img = Image.new('RGBA', (2000, 2000), (0, 0, 0, 0))
    temp_draw = ImageDraw.Draw(temp_img)
    
    # Measure each part separately
    arrow_size = font_size_px
    total_width = 0
    max_height = 0
    segments = []
    
    for char in text:
        if char == '↑' or char == '↓':
            # Arrow takes space similar to a character plus padding for screws
            char_width = arrow_size
            char_height = arrow_size
            segments.append(('arrow', char, char_width, char_height))
            total_width += char_width
            max_height = max(max_height, char_height)
        else:
            # Regular text character
            bbox = temp_draw.textbbox((0, 0), char, font=font)
            char_width = bbox[2] - bbox[0]
            char_height = bbox[3] - bbox[1]
            segments.append(('text', char, char_width, char_height))
            total_width += char_width
            max_height = max(max_height, char_height)
    
    # Create the final image
    img_width = total_width + (2 * margin_px)
    img_height = max_height + (2 * margin_px)
    image = Image.new('RGBA', (img_width, img_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    
    # Draw each segment
    current_x = margin_px
    y_offset = margin_px + (max_height / 2)  # Center vertically
    
    for seg_type, char, width, height in segments:
        if seg_type == 'arrow':
            # Draw arrow at current position (padding already built into arrow function)
            arrow_x = current_x
            arrow_y = y_offset - (arrow_size / 2)
            if char == '↑':
                draw_up_arrow(draw, int(arrow_x), int(arrow_y), arrow_size, color)
            else:  # '↓'
                draw_down_arrow(draw, int(arrow_x), int(arrow_y), arrow_size, color)
            current_x += width
        else:
            # Draw text character
            bbox = draw.textbbox((0, 0), char, font=font)
            text_y = y_offset - ((bbox[3] - bbox[1]) / 2)
            draw.text((current_x, text_y), char, font=font, fill=color)
            current_x += width
    
    # Crop to content
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)
    
    # Generate filename
    filename_text = "".join(c for c in text if c.isalnum() or c.isspace()).replace(" ", "_")
    filename = f"/home/arjan-ubuntu/Documents/{filename_text}_{font_size_inches}in.png"
    
    # Save as PNG
    image.save(filename, 'PNG', dpi=(dpi, dpi))
    print(f"PNG created: {filename}")
    print(f"  - Font size: {font_size_inches} inches ({font_size_px} pixels at {dpi} DPI)")
    print(f"  - Image dimensions: {image.width}x{image.height} pixels")
    print(f"  - Arrows drawn with 15% padding for screw clearance")
    
    return image

def main():
    parser = argparse.ArgumentParser(description='Create transparent PNG text images (arrows drawn as shapes with screw padding)')
    parser.add_argument('text', type=str, help='Text to render in the image (use ↑ and ↓ for arrows)')
    parser.add_argument('--size', '-s', type=float, default=1.0,
                       help='Font size in inches (default: 1.0)')
    parser.add_argument('--dpi', '-d', type=int, default=300,
                       help='DPI for print quality (default: 300)')
    parser.add_argument('--color', '-c', type=str, default='black',
                       help='Text color: red, green, blue, black, white, lightgreen, or custom "R,G,B" (default: black)')
    parser.add_argument('--margin', '-m', type=float, default=0.5,
                       help='Margin in inches around text (default: 0.5)')
    
    args = parser.parse_args()
    
    print(f"Creating image for text: '{args.text}'")
    
    # Parse color
    if args.color.lower() == 'red':
        color = (255, 0, 0, 255)
    elif args.color.lower() == 'green':
        color = (0, 255, 0, 255)
    elif args.color.lower() == 'blue':
        color = (0, 0, 255, 255)
    elif args.color.lower() == 'black':
        color = (0, 0, 0, 255)
    elif args.color.lower() == 'white':
        color = (255, 255, 255, 255)
    elif args.color.lower() == 'lightgreen':
        color = (144, 238, 144, 255)
    elif ',' in args.color:
        try:
            rgb = [int(x.strip()) for x in args.color.split(',')]
            if len(rgb) == 3:
                color = (*rgb, 255)
            else:
                color = tuple(rgb)
        except:
            print(f"Invalid color format. Using black.")
            color = (0, 0, 0, 255)
    else:
        print(f"Unknown color '{args.color}'. Using black.")
        color = (0, 0, 0, 255)
    
    # Create the text image
    create_text_image(
        text=args.text,
        font_size_inches=args.size,
        color=color,
        dpi=args.dpi,
        margin_inches=args.margin
    )

if __name__ == "__main__":
    main()