# Run this script to generate icons
# pip install Pillow first

from PIL import Image, ImageDraw, ImageFont
import os

os.makedirs("icons", exist_ok=True)

for size in [16, 48, 128]:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    
    # Background circle
    d.ellipse([1, 1, size-1, size-1], fill=(12, 12, 15, 255))
    
    # Green shield gradient approximation
    d.ellipse([2, 2, size-2, size-2], fill=(20, 20, 24, 255))
    
    # Shield shape
    pad  = size // 5
    mid  = size // 2
    
    # Simple shield polygon
    points = [
        (mid, pad),
        (size - pad, pad + size//6),
        (size - pad, mid),
        (mid, size - pad),
        (pad, mid),
        (pad, pad + size//6),
    ]
    d.polygon(points, fill=(110, 231, 183, 255))
    
    img.save(f"icons/icon{size}.png")
    print(f"Created icons/icon{size}.png")

print("All icons created!")
