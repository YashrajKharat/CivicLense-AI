import urllib.request
import json
import io
import os
import sys
from PIL import Image, ImageDraw
import numpy as np

def test_img(img, name):
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    img_bytes = buf.getvalue()

    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    header = (
        f'--{boundary}\r\n'
        'Content-Disposition: form-data; name="image"; filename="test.jpg"\r\n'
        'Content-Type: image/jpeg\r\n\r\n'
    ).encode('utf-8')
    footer = f'\r\n--{boundary}--\r\n'.encode('utf-8')
    body = header + img_bytes + footer

    req = urllib.request.Request(
        'http://127.0.0.1:8000/classify',
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"[{name}] -> IsCivic: {data.get('is_civic')} | Category: {data.get('detected_category')} | Dept: {data.get('assigned_department')} | Conf: {data.get('category_confidence')}%")
    except Exception as e:
        print(f"[{name}] -> Error: {e}")

if __name__ == '__main__':
    # 1. Spitting test image
    if os.path.exists('model/test_spitting.jpg'):
        test_img(Image.open('model/test_spitting.jpg'), 'Real Paan/Spit Image')

    # 2. Road / Pothole simulation
    pothole_img = Image.new('RGB', (300, 300), color=(80, 80, 80))
    d = ImageDraw.Draw(pothole_img)
    d.ellipse([70, 70, 230, 230], fill=(20, 20, 20), outline=(50, 50, 50))
    test_img(pothole_img, 'Pothole Synthetic')

    # 3. Tree simulation
    tree_img = Image.new('RGB', (300, 300), color=(30, 100, 30))
    d = ImageDraw.Draw(tree_img)
    d.rectangle([130, 100, 170, 280], fill=(90, 50, 20))
    d.ellipse([60, 30, 240, 160], fill=(20, 120, 30))
    test_img(tree_img, 'Fallen Tree Synthetic')

    # 4. Garbage pile simulation
    arr = np.random.randint(50, 200, (300, 300, 3), dtype=np.uint8)
    test_img(Image.fromarray(arr), 'Garbage / Random Noise')
