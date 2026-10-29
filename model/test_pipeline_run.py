import os
import sys
import io
from PIL import Image
import numpy as np

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
from pipeline import CivicPulsePipeline

print('Initializing CivicPulsePipeline...')
p = CivicPulsePipeline()

arr = np.random.randint(60, 100, (224, 224, 3), dtype=np.uint8)
for y in range(80, 140):
    for x in range(80, 140):
        if (x-110)**2 + (y-110)**2 < 30**2:
            arr[y, x] = [30, 30, 35]

img = Image.fromarray(arr)
buf = io.BytesIO()
img.save(buf, format='JPEG')
raw_bytes = buf.getvalue()

result = p.process_image(raw_bytes)
print('Decision:', result.get('civic_classification', {}).get('decision'))
if result.get('classification'):
    print('Detected Category:', result['classification'].get('category'))
    print('Department:', result['classification'].get('department'))
    print('Confidence:', result['classification'].get('confidence'))
print('Pipeline verified working!')
