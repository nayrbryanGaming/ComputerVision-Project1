from flask import Flask, jsonify, Response

app = Flask(__name__)


@app.after_request
def add_cors(r):
    r.headers['Access-Control-Allow-Origin'] = '*'
    r.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    r.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return r


@app.route('/api/health', methods=['GET', 'OPTIONS'])
@app.route('/', methods=['GET', 'OPTIONS'])
def health():
    if __import__('flask').request.method == 'OPTIONS':
        return Response('', 204)
    return jsonify({'status': 'ok', 'service': 'CV Pipeline API - Kelompok 5'})
