import os
import base64
import io
import json
from http.server import BaseHTTPRequestHandler
from PIL import Image

_API_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_API_DIR)
_DEFAULT_PATHS = [
    os.path.join(_ROOT, 'public', 'default.jpg'),
    os.path.join(_ROOT, 'public', 'city.png'),
    os.path.join(_ROOT, 'public', 'landscape.png'),
]


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        img_path = next((p for p in _DEFAULT_PATHS if os.path.exists(p)), None)

        if img_path is None:
            self._json(404, {'success': False, 'error_message': 'Default image not found'})
            return

        img = Image.open(img_path)
        if img.mode == 'RGBA':
            img = img.convert('RGB')

        w, h = img.size
        fmt = 'JPEG' if img_path.lower().endswith(('.jpg', '.jpeg')) else 'PNG'
        mime = 'image/jpeg' if fmt == 'JPEG' else 'image/png'

        buf = io.BytesIO()
        img.save(buf, format=fmt, quality=90)
        b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

        self._json(200, {
            'image_base64': f'data:{mime};base64,{b64}',
            'filename': os.path.basename(img_path),
            'dimensions': {'width': w, 'height': h},
        })

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def log_message(self, format, *args):
        pass

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)
