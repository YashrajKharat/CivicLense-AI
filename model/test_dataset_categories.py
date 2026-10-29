import urllib.request
import json
import io
import os
import glob

def test_file(file_path, expected_label):
    with open(file_path, 'rb') as f:
        img_bytes = f.read()

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
            print(f"Expected [{expected_label:20s}] -> IsCivic: {str(data.get('is_civic')):5s} | Detected: {str(data.get('detected_category')):25s} | Conf: {data.get('category_confidence')}%")
    except Exception as e:
        print(f"Expected [{expected_label:20s}] -> Error: {e}")

if __name__ == '__main__':
    dataset_cats = [
        'pothole',
        'fallen_tree',
        'Broken Streetlight',
        'open Manhole',
        'garbage_overflow',
        'Water Leakage',
        'non_civic'
    ]
    for cat in dataset_cats:
        files = glob.glob(f'model/dataset/{cat}/*.*')
        if files:
            test_file(files[0], cat)
