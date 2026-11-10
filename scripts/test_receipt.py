"""Generate a demo receipt image (PNG) used for browser testing the receipt flow."""
from PIL import Image, ImageDraw

W, H = 640, 900
img = Image.new("RGB", (W, H), (250, 250, 247))
d = ImageDraw.Draw(img)

lines = [
    (60, "SUNSHINE MARKET", 34, (20, 20, 20)),
    (110, "123 Main Street, Springfield", 20, (90, 90, 90)),
    (140, "Tel: 555-0142", 20, (90, 90, 90)),
    (200, "2020-10-18  20:24", 24, (30, 30, 30)),
    (240, "Transaction #72987869213046140", 22, (30, 30, 30)),
    (310, "Shampoo            x1   $4.65 T", 26, (30, 30, 30)),
    (355, "Conditioner        x1   $7.89 N", 26, (30, 30, 30)),
    (400, "Go Chocolates      x2  $17.98 N", 26, (30, 30, 30)),
    (470, "Subtotal                 $30.52", 26, (30, 30, 30)),
    (510, "Tax                       $2.98", 26, (30, 30, 30)),
    (555, "TOTAL                    $33.50", 30, (10, 10, 10)),
    (630, "CARD ****1234   APPROVED", 22, (90, 90, 90)),
    (670, "Thank you for shopping!", 22, (90, 90, 90)),
]
for y, text, size, color in lines:
    d.text((40, y), text, fill=color, font_size=size)

for y in range(720, 880, 14):
    d.line([(40, y), (W - 40, y)], fill=(210, 210, 205), width=1)

img.save("/tmp/receipt-test.png")
print("saved /tmp/receipt-test.png")
