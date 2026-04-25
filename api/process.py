"""CV Pipeline API — Kelompok 5
Pure-Python: NumPy + Pillow + SciPy. NO OpenCV, NO scikit-image."""
import base64
import io
import json
import time
import traceback
from http.server import BaseHTTPRequestHandler

import numpy as np
from PIL import Image
from scipy.ndimage import convolve, median_filter, uniform_filter, label as scipy_label


# ─── IMAGE UTILITIES ─────────────────────────────────────────────────────────

def b64_to_gray(b64: str) -> np.ndarray:
    if ',' in b64:
        b64 = b64.split(',', 1)[1]
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw))
    if img.mode == 'RGBA':
        img = img.convert('RGB')
    if img.mode != 'L':
        rgb = np.array(img.convert('RGB'), dtype=np.float32)
        gray = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
        return gray.astype(np.uint8)
    return np.array(img, dtype=np.uint8)


def resize_max(img: np.ndarray, max_dim: int = 800) -> np.ndarray:
    h, w = img.shape
    if max(h, w) <= max_dim:
        return img
    scale = max_dim / max(h, w)
    pil = Image.fromarray(img, 'L').resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return np.array(pil, dtype=np.uint8)


def to_b64(img: np.ndarray) -> str:
    buf = io.BytesIO()
    Image.fromarray(img.astype(np.uint8), 'L').save(buf, format='PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('utf-8')


# ─── NOISE ───────────────────────────────────────────────────────────────────

def add_gaussian_noise(img: np.ndarray, level: int) -> np.ndarray:
    sigma = (level / 100.0) * 255.0
    noise = np.random.normal(0.0, sigma, img.shape)
    return np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)


def add_salt_pepper_noise(img: np.ndarray, level: int) -> np.ndarray:
    out = img.copy()
    n_noise = int(img.size * level / 100)
    n_half = n_noise // 2
    idx = np.arange(img.size)
    np.random.shuffle(idx)
    out.flat[idx[:n_half]] = 255
    out.flat[idx[n_half:n_half * 2]] = 0
    return out


# ─── FILTERING ───────────────────────────────────────────────────────────────

def _gauss_kernel(size: int = 5, sigma: float = 1.0) -> np.ndarray:
    half = size // 2
    y, x = np.mgrid[-half:half + 1, -half:half + 1]
    k = np.exp(-(x ** 2 + y ** 2) / (2.0 * sigma ** 2))
    return (k / k.sum()).astype(np.float32)


def apply_gaussian_filter(img: np.ndarray, kernel_size: int = 5, sigma: float = 1.0) -> np.ndarray:
    kernel = _gauss_kernel(kernel_size, sigma)
    result = convolve(img.astype(np.float32), kernel, mode='reflect')
    return np.clip(result, 0, 255).astype(np.uint8)


def apply_median_filter(img: np.ndarray, kernel_size: int = 3) -> np.ndarray:
    return median_filter(img, size=kernel_size).astype(np.uint8)


# ─── EDGE DETECTION ──────────────────────────────────────────────────────────

def _convolve_edge(img: np.ndarray, kx: np.ndarray, ky: np.ndarray):
    f = img.astype(np.float32)
    gx = convolve(f, kx, mode='reflect')
    gy = convolve(f, ky, mode='reflect')
    mag = np.sqrt(gx ** 2 + gy ** 2)
    if mag.max() > 0:
        mag = mag / mag.max() * 255.0
    return gx, gy, mag


def apply_sobel(img: np.ndarray, threshold: int = 50) -> np.ndarray:
    Kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    Ky = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)
    _, _, mag = _convolve_edge(img, Kx, Ky)
    return np.where(mag > threshold, 255, 0).astype(np.uint8)


def apply_prewitt(img: np.ndarray, threshold: int = 50) -> np.ndarray:
    Kx = np.array([[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]], dtype=np.float32)
    Ky = np.array([[-1, -1, -1], [0, 0, 0], [1, 1, 1]], dtype=np.float32)
    _, _, mag = _convolve_edge(img, Kx, Ky)
    return np.where(mag > threshold, 255, 0).astype(np.uint8)


def apply_log(img: np.ndarray, threshold: int = 50) -> np.ndarray:
    smoothed = apply_gaussian_filter(img, kernel_size=5, sigma=1.4)
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
    smoothed = apply_gaussian_filter(img, kernel_size=5, sigma=1.0)
    Kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    Ky = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)
    gx, gy, mag = _convolve_edge(smoothed, Kx, Ky)
    angle = np.degrees(np.arctan2(gy, gx)) % 180.0

    padded = np.pad(mag, 1, mode='edge')
    m0   = (angle < 22.5)   | (angle >= 157.5)
    m45  = (angle >= 22.5)  & (angle < 67.5)
    m90  = (angle >= 67.5)  & (angle < 112.5)
    m135 = (angle >= 112.5) & (angle < 157.5)

    n1_0,   n2_0   = padded[1:-1, :-2],  padded[1:-1, 2:]
    n1_45,  n2_45  = padded[:-2,  2:],   padded[2:,  :-2]
    n1_90,  n2_90  = padded[:-2,  1:-1], padded[2:,  1:-1]
    n1_135, n2_135 = padded[:-2,  :-2],  padded[2:,  2:]

    keep = (
        (m0   & (mag >= n1_0)   & (mag >= n2_0))   |
        (m45  & (mag >= n1_45)  & (mag >= n2_45))  |
        (m90  & (mag >= n1_90)  & (mag >= n2_90))  |
        (m135 & (mag >= n1_135) & (mag >= n2_135))
    )
    suppressed = np.where(keep, mag, 0.0)

    strong = suppressed >= high
    weak   = (suppressed >= low) & (suppressed < high)

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


def _apply_edge(img, method, threshold, canny_low, canny_high):
    if method == 'prewitt':
        return apply_prewitt(img, threshold)
    if method == 'log':
        return apply_log(img, threshold)
    if method == 'canny':
        return apply_canny(img, canny_low, canny_high)
    return apply_sobel(img, threshold)


# ─── METRICS ─────────────────────────────────────────────────────────────────

def calc_psnr(ref: np.ndarray, img: np.ndarray) -> float:
    mse = float(np.mean((ref.astype(np.float32) - img.astype(np.float32)) ** 2))
    if mse == 0.0:
        return 100.0
    return round(10.0 * np.log10(255.0 ** 2 / mse), 2)


def calc_ssim(ref: np.ndarray, img: np.ndarray) -> float:
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    r, i = ref.astype(np.float32), img.astype(np.float32)
    win = 11
    mu1, mu2 = uniform_filter(r, win), uniform_filter(i, win)
    mu1_sq, mu2_sq = mu1 * mu1, mu2 * mu2
    sigma1_sq = np.maximum(0.0, uniform_filter(r * r, win) - mu1_sq)
    sigma2_sq = np.maximum(0.0, uniform_filter(i * i, win) - mu2_sq)
    sigma12   = uniform_filter(r * i, win) - mu1 * mu2
    num = (2.0 * mu1 * mu2 + C1) * (2.0 * sigma12 + C2)
    den = (mu1_sq + mu2_sq + C1) * (sigma1_sq + sigma2_sq + C2)
    return round(float(np.mean(np.where(den > 0, num / den, 1.0))), 4)


def count_edges(edge_img: np.ndarray) -> int:
    return int(np.sum(edge_img > 128))


# ─── ANALYSIS ────────────────────────────────────────────────────────────────

def build_analysis(m: dict) -> dict:
    pg_g  = m['psnr_filtered_gauss_gaussian']
    pg_m  = m['psnr_filtered_gauss_median']
    psp_g = m['psnr_filtered_sp_gaussian']
    psp_m = m['psnr_filtered_sp_median']

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

    avg_g = (m['edge_count_gauss_gaussian'] + m['edge_count_sp_gaussian']) / 2
    avg_m = (m['edge_count_gauss_median']   + m['edge_count_sp_median'])   / 2

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

    gn_nrr = round((pg_g  - m['psnr_noisy_gaussian'])    / max(m['psnr_noisy_gaussian'], 0.01)    * 100, 1)
    sp_nrr = round((psp_m - m['psnr_noisy_salt_pepper']) / max(m['psnr_noisy_salt_pepper'], 0.01) * 100, 1)
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


# ─── HTTP HANDLER ────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('content-length', 0))
        raw = self.rfile.read(content_length)
        t0 = time.time()

        try:
            body = json.loads(raw) if raw else {}

            b64 = body.get('image_base64', '')
            if not b64:
                self._json(400, {
                    'success': False,
                    'error_code': 'INVALID_IMAGE',
                    'error_message': 'Tidak ada gambar yang dikirim.',
                })
                return

            try:
                original = b64_to_gray(b64)
            except Exception:
                self._json(400, {
                    'success': False,
                    'error_code': 'INVALID_IMAGE',
                    'error_message': 'Gambar tidak dapat dibaca. Pastikan format JPG/PNG/WEBP.',
                })
                return

            if original.size > 5_000_000:
                self._json(413, {
                    'success': False,
                    'error_code': 'TOO_LARGE',
                    'error_message': 'Gambar terlalu besar setelah decode (> 5 MP).',
                })
                return

            original = resize_max(original, 800)

            noise_level = max(1, min(int(body.get('noise_level',    20)), 50))
            edge_method = str(body.get('edge_method',    'sobel')).lower()
            edge_thr    = max(0, min(int(body.get('edge_threshold', 50)), 255))
            canny_low   = max(0, min(int(body.get('canny_low',     100)), 254))
            canny_high  = max(canny_low + 1, min(int(body.get('canny_high', 140)), 255))
            ks          = int(body.get('kernel_size', 3))
            kernel_size = ks if ks in (3, 5) else 3

            n_gauss = add_gaussian_noise(original, noise_level)
            n_sp    = add_salt_pepper_noise(original, noise_level)

            fg_gauss  = apply_gaussian_filter(n_gauss, kernel_size)
            fg_median = apply_median_filter(n_gauss,   kernel_size)
            fsp_gauss  = apply_gaussian_filter(n_sp,   kernel_size)
            fsp_median = apply_median_filter(n_sp,     kernel_size)

            e_gg  = _apply_edge(fg_gauss,  edge_method, edge_thr, canny_low, canny_high)
            e_gm  = _apply_edge(fg_median, edge_method, edge_thr, canny_low, canny_high)
            e_spg = _apply_edge(fsp_gauss, edge_method, edge_thr, canny_low, canny_high)
            e_spm = _apply_edge(fsp_median, edge_method, edge_thr, canny_low, canny_high)

            metrics = {
                'psnr_noisy_gaussian':           calc_psnr(original, n_gauss),
                'psnr_noisy_salt_pepper':         calc_psnr(original, n_sp),
                'psnr_filtered_gauss_gaussian':   calc_psnr(original, fg_gauss),
                'psnr_filtered_gauss_median':     calc_psnr(original, fg_median),
                'psnr_filtered_sp_gaussian':      calc_psnr(original, fsp_gauss),
                'psnr_filtered_sp_median':        calc_psnr(original, fsp_median),
                'ssim_noisy_gaussian':            calc_ssim(original, n_gauss),
                'ssim_filtered_gauss_gaussian':   calc_ssim(original, fg_gauss),
                'ssim_filtered_sp_median':        calc_ssim(original, fsp_median),
                'edge_count_gauss_gaussian':      count_edges(e_gg),
                'edge_count_gauss_median':        count_edges(e_gm),
                'edge_count_sp_gaussian':         count_edges(e_spg),
                'edge_count_sp_median':           count_edges(e_spm),
            }

            analysis = build_analysis(metrics)
            ms = round((time.time() - t0) * 1000)

            self._json(200, {
                'success': True,
                'processing_time_ms': ms,
                'images': {
                    'original':                     to_b64(original),
                    'noisy_gaussian':               to_b64(n_gauss),
                    'noisy_salt_pepper':            to_b64(n_sp),
                    'filtered_gauss_gaussian':      to_b64(fg_gauss),
                    'filtered_gauss_median':        to_b64(fg_median),
                    'filtered_sp_gaussian':         to_b64(fsp_gauss),
                    'filtered_sp_median':           to_b64(fsp_median),
                    'edge_gauss_filtered_gaussian': to_b64(e_gg),
                    'edge_gauss_filtered_median':   to_b64(e_gm),
                    'edge_sp_filtered_gaussian':    to_b64(e_spg),
                    'edge_sp_filtered_median':      to_b64(e_spm),
                },
                'metrics': metrics,
                'analysis': analysis,
            })

        except MemoryError:
            self._json(413, {
                'success': False,
                'error_code': 'TOO_LARGE',
                'error_message': 'Gambar terlalu besar untuk diproses. Coba gambar lebih kecil.',
            })
        except Exception as exc:
            self._json(500, {
                'success': False,
                'error_code': 'PROCESSING_FAILED',
                'error_message': f'Error saat processing: {str(exc)}',
                'details': traceback.format_exc(),
            })

    def log_message(self, format, *args):
        pass

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, status: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)
