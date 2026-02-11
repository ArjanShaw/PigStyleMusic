from PIL import Image, ImageDraw, ImageFont
import os
import sys
import argparse

# Path to your TTF font
font_path = "/home/arjan-ubuntu/Documents/keep-on-truckin/KEEPT___.TTF"

def inches_to_pixels(inches, dpi=300):
    """Convert inches to pixels at specified DPI"""
    return int(inches * dpi)

def create_text_image(text, font_size_inches, color, dpi=300, margin_inches=0.5):
    """
    Create text image with transparent background
    font_size_inches: font size in inches
    dpi: dots per inch (default 300 for print quality)
    margin_inches: margin in inches around text
    """
    # Convert inches to pixels
    font_size_px = inches_to_pixels(font_size_inches, dpi)
    margin_px = inches_to_pixels(margin_inches, dpi)
    
    # Load font
    try:
        font = ImageFont.truetype(font_path, font_size_px)
    except IOError:
        print(f"Error: Could not load font from {font_path}")
        sys.exit(1)

    # Create a temporary image large enough to measure text properly
    temp_img = Image.new('RGBA', (2000, 2000), (0, 0, 0, 0))
    temp_draw = ImageDraw.Draw(temp_img)
    
    # Get text bounding box
    text_bbox = temp_draw.textbbox((0, 0), text, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    
    # Get font metrics for better vertical alignment
    ascent, descent = font.getmetrics()
    
    # Create image with transparent background
    img_width = text_width + (2 * margin_px)
    img_height = text_height + (2 * margin_px)
    image = Image.new('RGBA', (img_width, img_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Position text to account for ascenders/descenders
    # Use negative y offset to position text properly
    x = margin_px - text_bbox[0]  # Compensate for left bearing
    y = margin_px - text_bbox[1]  # Compensate for top bearing (this fixes the vertical alignment)
    
    draw.text((x, y), text, font=font, fill=color)
    
    # Crop to remove unnecessary transparency
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)
    else:
        # If no content found, use original dimensions
        print("Warning: No content found in image, using original dimensions")
    
    # Generate filename from text
    filename_text = "".join(c for c in text if c.isalnum() or c.isspace()).replace(" ", "_")
    filename = f"/home/arjan-ubuntu/Documents/{filename_text}_{font_size_inches}in.png"
    
    # Save as PNG
    image.save(filename, 'PNG', dpi=(dpi, dpi))
    print(f"PNG created: {filename}")
    print(f"  - Font size: {font_size_inches} inches ({font_size_px} pixels at {dpi} DPI)")
    print(f"  - Image dimensions: {image.width}x{image.height} pixels")
    print(f"  - Physical size: {image.width/dpi:.2f}\" x {image.height/dpi:.2f}\" at {dpi} DPI")
    
    return image

def main():
    parser = argparse.ArgumentParser(description='Create transparent PNG text images')
    parser.add_argument('text', type=str, help='Text to render in the image (use quotes if it contains spaces or special characters)')
    parser.add_argument('--size', '-s', type=float, default=6.0,
                       help='Font size in inches (default: 6.0)')
    parser.add_argument('--dpi', '-d', type=int, default=300,
                       help='DPI for print quality (default: 300)')
    parser.add_argument('--color', '-c', type=str, default='black',
                       help='Text color: red, green, blue, black, white, lightgreen, or custom "R,G,B" (default: black)')
    parser.add_argument('--margin', '-m', type=float, default=0.5,
                       help='Margin in inches around text (default: 0.5)')
    parser.add_argument('--no-crop', action='store_true',
                       help='Disable automatic cropping of transparent edges')
    
    args = parser.parse_args()
    
    # Print debug info
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
        # Custom RGB values
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