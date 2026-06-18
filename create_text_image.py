from PIL import Image, ImageDraw, ImageFont

# Path to your font
font_path = "/home/arjan-ubuntu/Documents/PigStyleMusic/keep-on-truckin/KEEPT___.TTF"

# Your text
text = "Fri, Sat"

# Settings
font_size = 100  # pixels
color = (0, 0, 0, 255)  # black
margin = 20  # pixels

# Load font
font = ImageFont.truetype(font_path, font_size)

# Measure text - add a descender character to get full height
temp_img = Image.new('RGBA', (1, 1))
temp_draw = ImageDraw.Draw(temp_img)

# Measure with 'jg' to capture descenders
test_text = text + "jg"
bbox = temp_draw.textbbox((0, 0), test_text, font=font)
text_width = bbox[2] - bbox[0]
text_height = bbox[3] - bbox[1]

# Create image with extra bottom padding
img_width = text_width + (margin * 2)
img_height = text_height + (margin * 2)
image = Image.new('RGBA', (img_width, img_height), (0, 0, 0, 0))

# Draw text - offset to account for baseline
draw = ImageDraw.Draw(image)
draw.text((margin, margin), text, font=font, fill=color)

# Save
image.save("/home/arjan-ubuntu/Documents/Record_Store.png")
print(f"Saved: {image.width}x{image.height} pixels")