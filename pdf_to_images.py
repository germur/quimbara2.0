import sys
import os

try:
    import fitz  # PyMuPDF
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "PyMuPDF"])
    import fitz

pdf_path = "./public/images/UFC_328_Tactical_Blueprint.pdf"
output_dir = "./public/images/tactical- blueprint"

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

doc = fitz.open(pdf_path)
for i in range(len(doc)):
    page = doc.load_page(i)
    # zoom factor for high quality
    zoom = 2.0 
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    # save as png
    output_path = os.path.join(output_dir, f"page-{i+1:02d}.png")
    pix.save(output_path)
    print(f"Saved {output_path}")

print("Done converting PDF to images.")
