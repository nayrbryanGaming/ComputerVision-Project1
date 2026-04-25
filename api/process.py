"""
CV Pipeline API — Kelompok 5
Pure-Python implementation: NumPy + Pillow + SciPy
NO OpenCV, NO scikit-image.
"""
import base64
import io
import time
import traceback

from flask import Flask, request, jsonify, Response
import numpy as np
from PIL import Image
from scipy.ndimage import convolve, median_filter, uniform_filter, label as scipy_label

app = Flask(__name__)


# ─── CORS ────────────────────────────────────────────────────────────────────

@app.after_request
def add_cors(r):
    r.headers['Access-Control-Allow-Origin'] = '*'
    r.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    r.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return r


# ─── IMAGE UTILITIES ─────────────────────────────────────────────────────────

def b64_to_gray(b64: str) -> np.ndarray:
    """Decode base64 data-URL → grayscale uint8 numpy array."""
    if ',' in b64:
        b64 = b64.split(',', 1)[1]
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw))
    if img.mode == 'RGBA':
        img = img.convert('RGB')
    if img.mode != 'L':
        # ITU-R BT.601 luma: Y = 0.299R + 0.587G + 0.114B
        rgb = np.array(img.convert('RGB'), dtype=np.float32)
        gray = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
        return gray.astype(np.uint8)
    return np.array(img, dtype=np.uint8)


def resize_max(img: np.ndarray, max_dim: int = 800) -> np.ndarray:
    """Resize proportionally so max(h, w) <= max_dim."""
    h, w = img.shape
    if max(h, w) <= max_dim:
        return img
    scale = max_dim / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    pil = Image.fromarray(img, 'L').resize((new_w, new_h), Image.LANCZOS)
    return np.array(pil, dtype=np.uint8)


def to_b64(img: np.ndarray) -> str:
    """Encode grayscale uint8 numpy array → PNG base64 data-URL."""
    buf = io.BytesIO()
    Image.fromarray(img.astype(np.uint8), 'L').save(buf, format='PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('utf-8')


# ─── NOISE GENERATION ────────────────────────────────────────────────────────

def add_gaussian_noise(img: np.ndarray, level: int) -> np.ndarray:
    """
    Gaussian noise: σ = level/100 × 255.
    Noise sampled from N(0, σ²) and added pixel-wise.
    """
    sigma = (level / 100.0) * 255.0
    noise = np.random.normal(0.0, sigma, img.shape)
    return np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)


def add_salt_pepper_noise(img: np.ndarray, level: int) -> np.ndarray:
    """
    Salt & Pepper noise: level% of pixels become 255 (salt) or 0 (pepper),
    split evenly between the two.
    """
    out = img.copy()
    n_total = img.size
    n_noise = int(n_total * level / 100)
    n_salt = n_noise // 2
    n_pepper = n_noise // 2

    # Shuffle flat indices; first n_salt → salt, next n_pepper → pepper
    all_idx = np.arange(n_total)
    np.random.shuffle(all_idx)
    out.flat[all_idx[:n_salt]] = 255
    out.flat[all_idx[n_salt:n_salt + n_pepper]] = 0
    return out


# ─── FILTERING ───────────────────────────────────────────────────────────────

def _gauss_kernel(size: int = 5, sigma: float = 1.0) -> np.ndarray:
    """2-D Gaussian kernel, normalized so weights sum to 1."""
    half = size // 2
    y, x = np.mgrid[-half:half + 1, -half:half + 1]
    k = np.exp(-(x ** 2 + y ** 2) / (2.0 * sigma ** 2))
    return (k / k.sum()).astype(np.float32)


def apply_gaussian_filter(img: np.ndarray, kernel_size: int = 5, sigma: float = 1.0) -> np.ndarray:
    """
    Gaussian filter via 2-D convolution with reflect-padding.
    kernel_size × kernel_size kernel, weights follow K(x,y) = e^(-(x²+y²)/(2σ²)).
    """
    kernel = _gauss_kernel(kernel_size, sigma)
    result = convolve(img.astype(np.float32), kernel, mode='reflect')
    return np.clip(result, 0, 255).astype(np.uint8)


def apply_median_filter(img: np.ndarray, kernel_size: int = 3) -> np.ndarray:
    """
    Median filter: for each pixel take the median of its kernel_size×kernel_size
    neighborhood. Non-linear — eliminates outliers without pulling the mean.
    """
    return median_filter(img, size=kernel_size).astype(np.uint8)


# ─── EDGE DETECTION ──────────────────────────────────────────────────────────

def _convolve_edge(img: np.ndarray, kx: np.ndarray, ky: np.ndarray):
    """Convolve with two kernels, return (Gx, Gy, magnitude_normalized)."""
    f = img.astype(np.float32)
    gx = convolve(f, kx, mode='reflect')
    gy = convolve(f, ky, mode='reflect')
    mag = np.sqrt(gx ** 2 + gy ** 2)
    if mag.max() > 0:
        mag = mag / mag.max() * 255.0
    return gx, gy, mag


def apply_sobel(img: np.ndarray, threshold: int = 50) -> np.ndarray:
    """
    Sobel operator.
    Gx kernel (horizontal):  [[-1,0,+1],[-2,0,+2],[-1,0,+1]]
    Gy kernel (vertical):    [[-1,-2,-1],[0,0,0],[+1,+2,+1]]
    G = sqrt(Gx²+Gy²), threshold → binary edge image.
    """
    Kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    Ky = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)
    _, _, mag = _convolve_edge(img, Kx, Ky)
    return np.where(mag > threshold, 255, 0).astype(np.uint8)


def apply_prewitt(img: np.ndarray, threshold: int = 50) -> np.ndarray:
    """
    Prewitt operator.
    Px kernel: [[-1,0,+1],[-1,0,+1],[-1,0,+1]]
    Py kernel: [[-1,-1,-1],[0,0,0],[+1,+1,+1]]
    Simpler weights than Sobel; slightly more noise-sensitive.
    """
    Kx = np.array([[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]], dtype=np.float32)
    Ky = np.array([[-1, -1, -1], [0, 0, 0], [1, 1, 1]], dtype=np.float32)
    _, _, mag = _convolve_edge(img, Kx, Ky)
    return np.where(mag > threshold, 255, 0).astype(np.uint8)


def apply_log(img: np.ndarray, threshold: int = 50) -> np.ndarray:
    """
    Laplacian of Gaussian (LoG).
    Step 1: Gaussian smoothing (σ=1.4) to suppress noise.
    Step 2: Convolve with the 5×5 LoG kernel from slide 30.
    Step 3: |response| normalized → threshold → binary edge.
    """
    smoothed = apply_gaussian_filter(img, kernel_size=5, sigma=1.4)

    # Exact kernel from lecture slide 30
    LOG_KERNEL = np.array([
        [0,  0, -1,  0,  0],
        [0, -1, -2, -1,  0],
        [-1, -2, 16, -2, -1],
        [0, -1, -2, -1,  0],
        [0,  0, -1,  0,  0],
    ], dtype=np.float32)

    resp = convolve(smoothed.astype(np.float32), LOG_KERNEL, mode='reflect')
    abs_resp = np.abs(resp)
    if abs_resp.max() > 0:
        abs_resp = abs_resp / abs_resp.max() * 255.0
    return np.where(abs_resp > threshold, 255, 0).astype(np.uint8)


def apply_canny(img: np.ndarray, low: int = 100, high: int = 140) -> np.ndarray:
    """
    Canny edge detector — 5 stages (lecture slides 36-47):
      1. Gaussian smoothing (σ=1.0, 5×5)
      2. Sobel gradient magnitude + direction
      3. Non-maximum suppression (vectorized)
      4. Double thresholding (strong ≥ high, weak ∈ [low, high))
      5. Hysteresis: keep weak pixels connected to strong pixels
    """
    # Stage 1 — Gaussian smoothing
    smoothed = apply_gaussian_filter(img, kernel_size=5, sigma=1.0)

    # Stage 2 — Gradients
    Kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    Ky = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)
    gx, gy, mag = _convolve_edge(smoothed, Kx, Ky)
    angle = np.degrees(np.arctan2(gy, gx)) % 180.0

    # Stage 3 — Vectorized NMS: quantize angle to 4 directions, compare neighbours
    padded = np.pad(mag, 1, mode='edge')
    ang = angle

    m0   = (ang < 22.5)  | (ang >= 157.5)   # horizontal → compare left/right
    m45  = (ang >= 22.5) & (ang < 67.5)      # diagonal 45°
    m90  = (ang >= 67.5) & (ang < 112.5)     # vertical
    m135 = (ang >= 112.5) & (ang < 157.5)    # diagonal 135°

    n1_0,   n2_0   = padded[1:-1, :-2],  padded[1:-1, 2:]    # left, right
    n1_45,  n2_45  = padded[:-2,  2:],   padded[2:,  :-2]    # top-right, bot-left
    n1_90,  n2_90  = padded[:-2,  1:-1], padded[2:,  1:-1]   # top, bottom
    n1_135, n2_135 = padded[:-2,  :-2],  padded[2:,  2:]     # top-left, bot-right

    keep = (
        (m0   & (mag >= n1_0)   & (mag >= n2_0))   |
        (m45  & (mag >= n1_45)  & (mag >= n2_45))  |
        (m90  & (mag >= n1_90)  & (mag >= n2_90))  |
        (m135 & (mag >= n1_135) & (mag >= n2_135))
    )
    suppressed = np.where(keep, mag, 0.0)

    # Stage 4 — Double thresholding
    strong = suppressed >= high
    weak   = (suppressed >= low) & (suppressed < high)

    # Stage 5 — Hysteresis via connected-component labelling
    candidate = (strong | weak).astype(np.int32)
    labeled_arr, n_labels = scipy_label(candidate)

    result = np.zeros_like(mag, dtype=np.uint8)
    if n_labels > 0:
        strong_labels = np.unique(labeled_arr[strong])
        strong_labels = strong_labels[strong_labels > 0]
        if strong_labels.size > 0:
            keep_mask = np.zeros(int(labeled_arr.max()) + 1, dtype=bool)
            keep_mask[strong_labels] = True
            result = (keep_mask[labeled_arr] * 255).astype(np.uint8)

    return result


def _apply_edge(img: np.ndarray, method: str, threshold: int,
                canny_low: int, canny_high: int) -> np.ndarray:
    if method == 'prewitt':
        return apply_prewitt(img, threshold)
    if method == 'log':
        return apply_log(img, threshold)
    if method == 'canny':
        return apply_canny(img, canny_low, canny_high)
    return apply_sobel(img, threshold)


# ─── QUALITY METRICS ─────────────────────────────────────────────────────────

def calc_psnr(ref: np.ndarray, img: np.ndarray) -> float:
    """PSNR in dB. Higher = more similar to reference (less noise)."""
    mse = float(np.mean((ref.astype(np.float32) - img.astype(np.float32)) ** 2))
    if mse == 0.0:
        return 100.0
    return round(10.0 * np.log10(255.0 ** 2 / mse), 2)


def calc_ssim(ref: np.ndarray, img: np.ndarray) -> float:
    """
    SSIM with 11×11 uniform window approximation.
    Range 0–1 (1 = identical).
    """
    C1 = (0.01 * 255) ** 2
    C2 = (0.03 * 255) ** 2
    r = ref.astype(np.float32)
    i = img.astype(np.float32)
    win = 11
    mu1 = uniform_filter(r, win)
    mu2 = uniform_filter(i, win)
    mu1_sq, mu2_sq = mu1 * mu1, mu2 * mu2
    sigma1_sq = np.maximum(0.0, uniform_filter(r * r, win) - mu1_sq)
    sigma2_sq = np.maximum(0.0, uniform_filter(i * i, win) - mu2_sq)
    sigma12   = uniform_filter(r * i, win) - mu1 * mu2
    num = (2.0 * mu1 * mu2 + C1) * (2.0 * sigma12 + C2)
    den = (mu1_sq + mu2_sq + C1) * (sigma1_sq + sigma2_sq + C2)
    ssim_map = np.where(den > 0, num / den, 1.0)
    return round(float(np.mean(ssim_map)), 4)


def count_edges(edge_img: np.ndarray) -> int:
    return int(np.sum(edge_img > 128))


# ─── AUTOMATIC ANALYSIS ──────────────────────────────────────────────────────

def build_analysis(m: dict) -> dict:
    pg_g  = m['psnr_filtered_gauss_gaussian']
    pg_m  = m['psnr_filtered_gauss_median']
    psp_g = m['psnr_filtered_sp_gaussian']
    psp_m = m['psnr_filtered_sp_median']

    # --- Gaussian Noise winner ---
    if pg_g >= pg_m:
        gn_winner = 'gaussian_filter'
        gn_reason = (
            f'Gaussian Filter lebih efektif untuk Gaussian Noise '
            f'(PSNR {pg_g} dB vs {pg_m} dB). '
            'Sesuai teori: filter Gaussian bekerja secara statistik optimal '
            'untuk noise berdistribusi normal — weighted average mengkonvergensi '
            'noise mendekati mean aslinya, mereduksi variansi secara efisien (slide 36-37).'
        )
    else:
        gn_winner = 'median_filter'
        gn_reason = (
            f'Median Filter kompetitif untuk Gaussian Noise '
            f'(PSNR {pg_m} dB vs {pg_g} dB). '
            'Meski Gaussian filter umumnya lebih optimal secara teoritis untuk distribusi normal, '
            'median filter mampu mengurangi noise dengan baik pada kondisi ini.'
        )

    # --- Salt & Pepper winner ---
    if psp_m >= psp_g:
        sp_winner = 'median_filter'
        sp_reason = (
            f'Median Filter jauh lebih efektif untuk Salt & Pepper Noise '
            f'(PSNR {psp_m} dB vs {psp_g} dB). '
            'Median adalah statistik robust: nilai 0 dan 255 (outlier) langsung '
            'tereliminasi karena tidak mempengaruhi median. Gaussian filter justru '
            'menyebarkan nilai ekstrem ke pixel sekitarnya (blur artefak).'
        )
    else:
        sp_winner = 'gaussian_filter'
        sp_reason = (
            f'Gaussian Filter mengungguli Median untuk Salt & Pepper Noise '
            f'(PSNR {psp_g} dB vs {psp_m} dB). '
            'Hasil ini tidak biasa; kemungkinan terjadi pada tingkat noise yang sangat rendah.'
        )

    # --- Edge performance ---
    ec_gg  = m['edge_count_gauss_gaussian']
    ec_gm  = m['edge_count_gauss_median']
    ec_spg = m['edge_count_sp_gaussian']
    ec_spm = m['edge_count_sp_median']
    avg_g = (ec_gg + ec_spg) / 2
    avg_m = (ec_gm + ec_spm) / 2

    if avg_m < avg_g:
        edge_perf = (
            f'Median filter menghasilkan tepi lebih bersih '
            f'({int(avg_m)} piksel rata-rata vs {int(avg_g)} dari Gaussian filter). '
            'Noise impulsif yang tidak direduksi oleh Gaussian filter '
            'terdeteksi sebagai tepi palsu, mengaburkan struktur objek asli (slide 36).'
        )
    else:
        edge_perf = (
            f'Gaussian filter menghasilkan {int(avg_g)} piksel tepi rata-rata, '
            f'Median filter {int(avg_m)} piksel. '
            'Perbedaan ini mencerminkan efektivitas reduksi noise masing-masing filter '
            'terhadap keakuratan deteksi tepi.'
        )

    # --- Summary ---
    gn_nrr  = round((pg_g  - m['psnr_noisy_gaussian'])    / max(m['psnr_noisy_gaussian'], 0.01)    * 100, 1)
    sp_nrr  = round((psp_m - m['psnr_noisy_salt_pepper']) / max(m['psnr_noisy_salt_pepper'], 0.01) * 100, 1)
    gn_label = 'Gaussian Filter' if gn_winner == 'gaussian_filter' else 'Median Filter'
    summary = (
        f'Eksperimen membuktikan bahwa pemilihan filter harus disesuaikan dengan jenis noise. '
        f'Untuk Gaussian Noise, {gn_label} memberikan PSNR terbaik '
        f'(peningkatan ≈{gn_nrr}% dari kondisi noisy). '
        f'Untuk Salt & Pepper Noise, Median Filter sangat unggul '
        f'(peningkatan ≈{sp_nrr}% dari kondisi noisy). '
        f'Ini menegaskan prinsip bahwa filtering sebelum deteksi tepi sangat penting — '
        f'noise yang tidak direduksi akan menghasilkan tepi palsu yang mengaburkan '
        f'struktur asli objek (slide 36).'
    )

    return {
        'gaussian_noise_winner': gn_winner,
        'salt_pepper_noise_winner': sp_winner,
        'reasoning_gaussian': gn_reason,
        'reasoning_salt_pepper': sp_reason,
        'edge_performance': edge_perf,
        'summary': summary,
    }


# ─── MAIN ENDPOINT ───────────────────────────────────────────────────────────

@app.route('/api/process', methods=['POST', 'OPTIONS'])
@app.route('/', methods=['POST', 'OPTIONS'])
def process_route():
    if request.method == 'OPTIONS':
        return Response('', 204)

    t0 = time.time()

    try:
        body = request.get_json(force=True, silent=True) or {}

        # ── Validate image ──────────────────────────────────────────────────
        b64 = body.get('image_base64', '')
        if not b64:
            return jsonify({
                'success': False,
                'error_code': 'INVALID_IMAGE',
                'error_message': 'Tidak ada gambar yang dikirim.',
            }), 400

        # ── Decode + resize ─────────────────────────────────────────────────
        try:
            original = b64_to_gray(b64)
        except Exception:
            return jsonify({
                'success': False,
                'error_code': 'INVALID_IMAGE',
                'error_message': 'Gambar tidak dapat dibaca. Pastikan format JPG/PNG/WEBP.',
            }), 400

        if original.size > 5_000_000:
            return jsonify({
                'success': False,
                'error_code': 'TOO_LARGE',
                'error_message': 'Gambar terlalu besar setelah decode (> 5 MP).',
            }), 413

        original = resize_max(original, 800)

        # ── Parameters ──────────────────────────────────────────────────────
        noise_level   = int(body.get('noise_level',    20))
        edge_method   = str(body.get('edge_method',    'sobel')).lower()
        edge_thr      = int(body.get('edge_threshold', 50))
        canny_low     = int(body.get('canny_low',      100))
        canny_high    = int(body.get('canny_high',     140))
        kernel_size   = int(body.get('kernel_size',    3))

        noise_level = max(1, min(noise_level, 50))
        edge_thr    = max(0, min(edge_thr, 255))
        canny_low   = max(0, min(canny_low, 254))
        canny_high  = max(canny_low + 1, min(canny_high, 255))
        kernel_size = kernel_size if kernel_size in (3, 5) else 3

        # ── Pipeline ────────────────────────────────────────────────────────

        # 1. Noise
        n_gauss = add_gaussian_noise(original, noise_level)
        n_sp    = add_salt_pepper_noise(original, noise_level)

        # 2. Filter each noisy image with both filters
        fg_gauss  = apply_gaussian_filter(n_gauss, kernel_size)
        fg_median = apply_median_filter(n_gauss,   kernel_size)
        fsp_gauss  = apply_gaussian_filter(n_sp,   kernel_size)
        fsp_median = apply_median_filter(n_sp,     kernel_size)

        # 3. Edge detection on all filtered images
        e_gg  = _apply_edge(fg_gauss,   edge_method, edge_thr, canny_low, canny_high)
        e_gm  = _apply_edge(fg_median,  edge_method, edge_thr, canny_low, canny_high)
        e_spg = _apply_edge(fsp_gauss,  edge_method, edge_thr, canny_low, canny_high)
        e_spm = _apply_edge(fsp_median, edge_method, edge_thr, canny_low, canny_high)

        # 4. Metrics
        metrics = {
            'psnr_noisy_gaussian':        calc_psnr(original, n_gauss),
            'psnr_noisy_salt_pepper':     calc_psnr(original, n_sp),
            'psnr_filtered_gauss_gaussian': calc_psnr(original, fg_gauss),
            'psnr_filtered_gauss_median':   calc_psnr(original, fg_median),
            'psnr_filtered_sp_gaussian':    calc_psnr(original, fsp_gauss),
            'psnr_filtered_sp_median':      calc_psnr(original, fsp_median),
            'ssim_noisy_gaussian':          calc_ssim(original, n_gauss),
            'ssim_filtered_gauss_gaussian': calc_ssim(original, fg_gauss),
            'ssim_filtered_sp_median':      calc_ssim(original, fsp_median),
            'edge_count_gauss_gaussian':    count_edges(e_gg),
            'edge_count_gauss_median':      count_edges(e_gm),
            'edge_count_sp_gaussian':       count_edges(e_spg),
            'edge_count_sp_median':         count_edges(e_spm),
        }

        analysis = build_analysis(metrics)
        ms = round((time.time() - t0) * 1000)

        return jsonify({
            'success': True,
            'processing_time_ms': ms,
            'images': {
                'original':                   to_b64(original),
                'noisy_gaussian':             to_b64(n_gauss),
                'noisy_salt_pepper':          to_b64(n_sp),
                'filtered_gauss_gaussian':    to_b64(fg_gauss),
                'filtered_gauss_median':      to_b64(fg_median),
                'filtered_sp_gaussian':       to_b64(fsp_gauss),
                'filtered_sp_median':         to_b64(fsp_median),
                'edge_gauss_filtered_gaussian': to_b64(e_gg),
                'edge_gauss_filtered_median':   to_b64(e_gm),
                'edge_sp_filtered_gaussian':    to_b64(e_spg),
                'edge_sp_filtered_median':      to_b64(e_spm),
            },
            'metrics': metrics,
            'analysis': analysis,
        })

    except MemoryError:
        return jsonify({
            'success': False,
            'error_code': 'TOO_LARGE',
            'error_message': 'Gambar terlalu besar untuk diproses. Coba gambar lebih kecil.',
        }), 413

    except Exception as exc:
        return jsonify({
            'success': False,
            'error_code': 'PROCESSING_FAILED',
            'error_message': f'Error saat processing: {str(exc)}',
            'details': traceback.format_exc(),
        }), 500
