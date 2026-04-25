import os
import base64
import io
from flask import Flask, jsonify, Response
from PIL import Image

app = Flask(__name__)

_API_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_API_DIR)
_DEFAULT_PATHS = [
    os.path.join(_ROOT, 'public', 'default.jpg'),
    os.path.join(_ROOT, 'public', 'city.png'),
    os.path.join(_ROOT, 'public', 'landscape.png'),
]


@app.after_request
def add_cors(r):
    r.headers['Access-Control-Allow-Origin'] = '*'
    r.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    r.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return r


@app.route('/api/default_image', methods=['GET', 'OPTIONS'])
@app.route('/api/default-image', methods=['GET', 'OPTIONS'])
@app.route('/', methods=['GET', 'OPTIONS'])
def default_image():
    if __import__('flask').request.method == 'OPTIONS':
        return Response('', 204)

    img_path = None
    for p in _DEFAULT_PATHS:
        if os.path.exists(p):
            img_path = p
            break

    if img_path is None:
        return jsonify({'success': False, 'error_message': 'Default image not found'}), 404

    img = Image.open(img_path)
    if img.mode == 'RGBA':
        img = img.convert('RGB')

    w, h = img.size
    fmt = 'JPEG' if img_path.lower().endswith(('.jpg', '.jpeg')) else 'PNG'
    mime = 'image/jpeg' if fmt == 'JPEG' else 'image/png'

    buf = io.BytesIO()
    img.save(buf, format=fmt, quality=90)
    b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

    return jsonify({
        'image_base64': f'data:{mime};base64,{b64}',
        'filename': os.path.basename(img_path),
        'dimensions': {'width': w, 'height': h},
    })
