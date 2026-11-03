import os
import glob
import numpy as np
from PIL import Image

directory = os.path.expanduser("~/Documents/socks ")
png_files = sorted(glob.glob(os.path.join(directory, "*.png")))

imgs = [Image.open(f).convert("RGBA") for f in png_files]
max_w = max(im.width for im in imgs)
max_h = max(im.height for im in imgs)
print(f"Target size: {max_w}x{max_h}")

imgs = [im.resize((max_w, max_h), Image.LANCZOS) for im in imgs]
images = [np.array(im) for im in imgs]

# The stacked array (what you originally asked for)
merged = np.stack(images, axis=0)
print("Stacked shape:", merged.shape)

# Tile into a grid so it can be saved as one image
n = len(images)
cols = int(np.ceil(np.sqrt(n)))
rows = int(np.ceil(n / cols))
grid = np.zeros((rows * max_h, cols * max_w, 4), dtype=np.uint8)
for i, img in enumerate(images):
    r, c = divmod(i, cols)
    grid[r*max_h:(r+1)*max_h, c*max_w:(c+1)*max_w] = img

out = os.path.join(directory, "merged.png")
Image.fromarray(grid, "RGBA").save(out)
print(f"Saved grid ({rows}x{cols}) to {out}")
