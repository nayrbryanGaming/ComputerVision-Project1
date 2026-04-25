"""CV Pipeline API — Kelompok 5
Pure-Python: NumPy + Pillow + SciPy + scikit-image. NO OpenCV."""
import base64
import io
import json
import time
import traceback
from http.server import BaseHTTPRequestHandler

import numpy as np
from PIL import Image
from scipy.ndimage import (
    gaussian_filter as ndimage_gauss,
    median_filter,
    convolve,
    label as scipy_label,
)

try:
    from skimage.metrics import structural_similarity as sk_ssim
    from skimage.feature import canny as sk_canny
    HAS_SKIMAGE = True
except ImportError:
    HAS_SKIMAGE = False


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


def resize_max(img: np.ndarray, max_dim: int = 600) -> np.ndarray:
    h, w = img.shape
    if max(h, w) <= max_dim:
        return img
    scale = max_dim / max(h, w)
    pil = Image.fromarray(img, 'L').resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return np.array(pil, dtype=np.uint8)


def to_jpeg_b64(img: np.ndarray, quality: int = 82) -> str:
    buf = io.BytesIO()
    Image.fromarray(img.astype(np.uint8), 'L').save(buf, format='JPEG', quality=quality, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('utf-8')


def calc_histogram(img: np.ndarray) -> list:
    hist, _ = np.histogram(img.flatten(), bins=64, range=(0, 255))
    return hist.tolist()


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

def apply_gaussian_filter(img: np.ndarray, kernel_size: int = 3, sigma: float = 1.0) -> np.ndarray:
    # truncate so kernel radius ~= kernel_size // 2
    truncate = (kernel_size // 2) / max(sigma, 0.1)
    result = ndimage_gauss(img.astype(np.float32), sigma=sigma, truncate=truncate, mode='reflect')
    return np.clip(result, 0, 255).astype(np.uint8)


def apply_median_filter(img: np.ndarray, window_size: int = 3) -> np.ndarray:
    return median_filter(img, size=window_size).astype(np.uint8)


# ─── EDGE DETECTION ──────────────────────────────────────────────────────────

def _convolve_edge(img: np.ndarray, kx: np.ndarray, ky: np.ndarray):
    f = img.astype(np.float32)
    gx = convolve(f, kx, mode='reflect')
    gy = convolve(f, ky, mode='reflect')
    mag = np.sqrt(gx ** 2 + gy ** 2)
    if mag.max() > 0:
        mag = mag / mag.max() * 255.0
    return mag


def apply_sobel(img: np.ndarray, threshold: int = 50) -> np.ndarray:
    Kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    Ky = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)
    mag = _convolve_edge(img, Kx, Ky)
    return np.where(mag > threshold, 255, 0).astype(np.uint8)


def apply_prewitt(img: np.ndarray, threshold: int = 50) -> np.ndarray:
    Kx = np.array([[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]], dtype=np.float32)
    Ky = np.array([[-1, -1, -1], [0, 0, 0], [1, 1, 1]], dtype=np.float32)
    mag = _convolve_edge(img, Kx, Ky)
    return np.where(mag > threshold, 255, 0).astype(np.uint8)


def apply_roberts(img: np.ndarray, threshold: int = 50) -> np.ndarray:
    f = img.astype(np.float32)
    g1 = f[:-1, :-1] - f[1:, 1:]   # diagonal difference
    g2 = f[:-1, 1:] - f[1:, :-1]   # anti-diagonal difference
    mag = np.sqrt(g1 ** 2 + g2 ** 2)
    mag_full = np.pad(mag, ((0, 1), (0, 1)), mode='edge')
    if mag_full.max() > 0:
        mag_full = mag_full / mag_full.max() * 255.0
    return np.where(mag_full > threshold, 255, 0).astype(np.uint8)


def apply_log(img: np.ndarray, threshold: int = 50) -> np.ndarray:
    smoothed = apply_gaussian_filter(img, kernel_size=5, sigma=1.0)
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


def apply_canny(img: np.ndarray, low_thr: float = 0.10, high_thr: float = 0.20,
                sigma: float = 1.0) -> np.ndarray:
    if HAS_SKIMAGE:
        img_norm = img.astype(np.float64) / 255.0
        edges = sk_canny(img_norm, sigma=sigma,
                         low_threshold=low_thr, high_threshold=high_thr)
        return (edges * 255).astype(np.uint8)
    # fallback: manual vectorized Canny
    smoothed = apply_gaussian_filter(img, kernel_size=5, sigma=sigma)
    Kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    Ky = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)
    f = smoothed.astype(np.float32)
    gx = convolve(f, Kx, mode='reflect')
    gy = convolve(f, Ky, mode='reflect')
    mag = np.sqrt(gx ** 2 + gy ** 2)
    angle = np.degrees(np.arctan2(gy, gx)) % 180.0

    padded = np.pad(mag, 1, mode='edge')
    m0   = (angle < 22.5)   | (angle >= 157.5)
    m45  = (angle >= 22.5)  & (angle < 67.5)
    m90  = (angle >= 67.5)  & (angle < 112.5)
    m135 = (angle >= 112.5) & (angle < 157.5)
    keep = (
        (m0   & (mag >= padded[1:-1, :-2])  & (mag >= padded[1:-1, 2:]))  |
        (m45  & (mag >= padded[:-2,  2:])   & (mag >= padded[2:,  :-2])) |
        (m90  & (mag >= padded[:-2,  1:-1]) & (mag >= padded[2:,  1:-1])) |
        (m135 & (mag >= padded[:-2,  :-2])  & (mag >= padded[2:,  2:]))
    )
    suppressed = np.where(keep, mag, 0.0)
    # convert float thresholds [0,1] to [0,255] for fallback
    lo = int(low_thr * 255)
    hi = int(high_thr * 255)
    strong = suppressed >= hi
    weak   = (suppressed >= lo) & (suppressed < hi)
    candidate = (strong | weak).astype(np.int32)
    labeled_arr, n_labels = scipy_label(candidate)
    result = np.zeros_like(mag, dtype=np.uint8)
    if n_labels > 0:
        sl = np.unique(labeled_arr[strong])
        sl = sl[sl > 0]
        if sl.size > 0:
            keep_mask = np.zeros(int(labeled_arr.max()) + 1, dtype=bool)
            keep_mask[sl] = True
            result = (keep_mask[labeled_arr] * 255).astype(np.uint8)
    return result


def _apply_edge(img, method, threshold, canny_low_thr, canny_high_thr):
    if method == 'prewitt':
        return apply_prewitt(img, threshold)
    if method == 'roberts':
        return apply_roberts(img, threshold)
    if method == 'log':
        return apply_log(img, threshold)
    if method == 'canny':
        return apply_canny(img, float(canny_low_thr), float(canny_high_thr))
    return apply_sobel(img, threshold)


# ─── METRICS ─────────────────────────────────────────────────────────────────

def calc_mse(ref: np.ndarray, img: np.ndarray) -> float:
    mse = float(np.mean((ref.astype(np.float64) - img.astype(np.float64)) ** 2))
    return round(mse, 2)


def calc_psnr(ref: np.ndarray, img: np.ndarray) -> float:
    mse = calc_mse(ref, img)
    if mse == 0.0:
        return 100.0
    return round(10.0 * np.log10(255.0 ** 2 / mse), 2)


def calc_ssim(ref: np.ndarray, img: np.ndarray) -> float:
    if HAS_SKIMAGE:
        score = sk_ssim(ref, img, data_range=255)
        return round(float(score), 4)
    # fallback: 11×11 uniform-window SSIM
    from scipy.ndimage import uniform_filter
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    r, i = ref.astype(np.float32), img.astype(np.float32)
    win = 11
    mu1, mu2 = uniform_filter(r, win), uniform_filter(i, win)
    mu1_sq, mu2_sq = mu1 * mu1, mu2 * mu2
    sigma1_sq = np.maximum(0, uniform_filter(r * r, win) - mu1_sq)
    sigma2_sq = np.maximum(0, uniform_filter(i * i, win) - mu2_sq)
    sigma12 = uniform_filter(r * i, win) - mu1 * mu2
    num = (2 * mu1 * mu2 + C1) * (2 * sigma12 + C2)
    den = (mu1_sq + mu2_sq + C1) * (sigma1_sq + sigma2_sq + C2)
    return round(float(np.mean(np.where(den > 0, num / den, 1.0))), 4)


def calc_edge_density(edge_img: np.ndarray) -> float:
    density = float(np.sum(edge_img > 127)) / edge_img.size * 100
    return round(density, 2)


def count_edges(edge_img: np.ndarray) -> int:
    return int(np.sum(edge_img > 128))


# ─── ANALYSIS ────────────────────────────────────────────────────────────────

def build_analysis(m: dict) -> dict:
    pg_g  = m['psnr_filtered_gauss_gaussian']
    pg_m  = m['psnr_filtered_gauss_median']
    psp_g = m['psnr_filtered_sp_gaussian']
    psp_m = m['psnr_filtered_sp_median']

    # Gaussian noise winner
    if pg_g >= pg_m:
        gn_winner = 'gaussian_filter'
        gn_reason = (
            f'Gaussian Filter lebih efektif untuk Gaussian Noise '
            f'(PSNR {pg_g} dB vs {pg_m} dB). '
            'Sesuai teori: filter Gaussian bekerja optimal untuk noise berdistribusi normal — '
            'weighted average mengkonvergensi noise mendekati mean aslinya (slide 36-37).'
        )
    else:
        gn_winner = 'median_filter'
        gn_reason = (
            f'Median Filter kompetitif untuk Gaussian Noise '
            f'(PSNR {pg_m} dB vs {pg_g} dB). '
            'Median filter mampu mengurangi noise dengan baik pada kondisi ini.'
        )

    # Salt & Pepper winner
    if psp_m >= psp_g:
        sp_winner = 'median_filter'
        sp_reason = (
            f'Median Filter jauh lebih efektif untuk Salt & Pepper Noise '
            f'(PSNR {psp_m} dB vs {psp_g} dB). '
            'Median adalah statistik robust: nilai 0 dan 255 (outlier) tidak mempengaruhi median, '
            'sedangkan Gaussian filter menyebarkan nilai ekstrem ke pixel sekitarnya.'
        )
    else:
        sp_winner = 'gaussian_filter'
        sp_reason = (
            f'Gaussian Filter mengungguli Median untuk Salt & Pepper Noise '
            f'(PSNR {psp_g} dB vs {psp_m} dB). '
            'Hasil tidak biasa; kemungkinan pada tingkat noise yang sangat rendah.'
        )

    # Edge performance
    avg_g = (m['edge_count_gauss_gaussian'] + m['edge_count_sp_gaussian']) / 2
    avg_m = (m['edge_count_gauss_median']   + m['edge_count_sp_median'])   / 2
    ed_gm = m['edge_density_gauss_median']
    ed_gg = m['edge_density_gauss_gaussian']
    if avg_m < avg_g:
        edge_perf = (
            f'Median filter menghasilkan tepi lebih bersih '
            f'({int(avg_m)} piksel rata-rata vs {int(avg_g)} dari Gaussian filter). '
            'Noise impulsif yang tidak direduksi Gaussian filter terdeteksi sebagai tepi palsu.'
        )
        better_edge_source = 'median'
    else:
        edge_perf = (
            f'Gaussian filter menghasilkan {int(avg_g)} piksel tepi rata-rata, '
            f'Median filter {int(avg_m)} piksel. '
            'Kedua filter memberikan hasil deteksi tepi yang sebanding.'
        )
        better_edge_source = 'gaussian'

    # Summary
    gn_nrr = round((pg_g - m['psnr_noisy_gaussian'])    / max(m['psnr_noisy_gaussian'], 0.01)    * 100, 1)
    sp_nrr = round((psp_m - m['psnr_noisy_salt_pepper']) / max(m['psnr_noisy_salt_pepper'], 0.01) * 100, 1)
    gn_label = 'Gaussian Filter' if gn_winner == 'gaussian_filter' else 'Median Filter'
    summary = (
        f'Eksperimen membuktikan pemilihan filter harus disesuaikan dengan jenis noise. '
        f'Untuk Gaussian Noise, {gn_label} memberikan PSNR terbaik '
        f'(peningkatan ≈{gn_nrr}% dari kondisi noisy). '
        f'Untuk Salt & Pepper Noise, Median Filter sangat unggul '
        f'(peningkatan ≈{sp_nrr}% dari kondisi noisy). '
        f'Ini menegaskan bahwa filtering sebelum deteksi tepi sangat penting (slide 36).'
    )

    # Simplified conclusions for new analysis panel
    overall_winner = 'gaussian_filter' if (pg_g + psp_g) >= (pg_m + psp_m) else 'median_filter'
    if overall_winner == 'gaussian_filter':
        filter_conclusion = (
            f'Gaussian Filter lebih efektif secara keseluruhan. '
            f'Karakteristik distribusi noise cocok dengan pendekatan statistik kernel Gaussian '
            f'(PSNR Gaussian noise: {pg_g} dB, S&P noise: {psp_g} dB).'
        )
        better_filter = 'gaussian'
    else:
        filter_conclusion = (
            f'Median Filter lebih efektif secara keseluruhan. '
            f'Nilai median tidak terpengaruh oleh outlier ekstrem dari noise '
            f'(PSNR Gaussian noise: {pg_m} dB, S&P noise: {psp_m} dB).'
        )
        better_filter = 'median'

    if better_edge_source == 'median':
        edge_conclusion = (
            f'Deteksi tepi setelah Median Filter menghasilkan tepi lebih tegas '
            f'(density {ed_gm}% vs {ed_gg}% dari Gaussian filter). '
            'Median lebih baik mempertahankan detail tepi saat meredam noise impulsif.'
        )
    else:
        edge_conclusion = (
            f'Deteksi tepi setelah Gaussian Filter menghasilkan tepi lebih baik '
            f'(density {ed_gg}% vs {ed_gm}% dari Median filter). '
            'Gaussian filter menjaga struktur gradien lebih halus untuk kondisi noise ini.'
        )

    return {
        'gaussian_noise_winner': gn_winner,
        'salt_pepper_noise_winner': sp_winner,
        'reasoning_gaussian': gn_reason,
        'reasoning_salt_pepper': sp_reason,
        'edge_performance': edge_perf,
        'summary': summary,
        'filter_conclusion': filter_conclusion,
        'edge_conclusion': edge_conclusion,
        'better_filter': better_filter,
        'better_edge_source': better_edge_source,
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
                self._json(400, {'success': False, 'error_code': 'INVALID_IMAGE',
                                 'error_message': 'Tidak ada gambar yang dikirim.'})
                return

            try:
                original = b64_to_gray(b64)
            except Exception:
                self._json(400, {'success': False, 'error_code': 'INVALID_IMAGE',
                                 'error_message': 'Gambar tidak dapat dibaca. Pastikan format JPG/PNG/WEBP.'})
                return

            if original.size > 5_000_000:
                self._json(413, {'success': False, 'error_code': 'TOO_LARGE',
                                 'error_message': 'Gambar terlalu besar setelah decode (> 5 MP).'})
                return

            original = resize_max(original, 600)

            # Parameters
            noise_level     = max(1, min(int(body.get('noise_level', 20)), 50))
            edge_method     = str(body.get('edge_method', 'sobel')).lower()
            edge_thr        = max(0, min(int(body.get('edge_threshold', 50)), 255))
            canny_low_thr   = max(0.01, min(float(body.get('canny_low_thr', 0.10)), 0.49))
            canny_high_thr  = max(canny_low_thr + 0.01, min(float(body.get('canny_high_thr', 0.20)), 0.50))
            gauss_ks        = int(body.get('gaussian_kernel_size', 3))
            gauss_sigma     = max(0.3, min(float(body.get('gaussian_sigma', 1.0)), 5.0))
            median_ws       = int(body.get('median_window_size', 3))
            gauss_ks        = gauss_ks if gauss_ks in (3, 5, 7) else 3
            median_ws       = median_ws if median_ws in (3, 5, 7) else 3

            # Pipeline
            n_gauss = add_gaussian_noise(original, noise_level)
            n_sp    = add_salt_pepper_noise(original, noise_level)

            fg_gauss  = apply_gaussian_filter(n_gauss, gauss_ks, gauss_sigma)
            fg_median = apply_median_filter(n_gauss,   median_ws)
            fsp_gauss  = apply_gaussian_filter(n_sp,   gauss_ks, gauss_sigma)
            fsp_median = apply_median_filter(n_sp,     median_ws)

            e_gg  = _apply_edge(fg_gauss,   edge_method, edge_thr, canny_low_thr, canny_high_thr)
            e_gm  = _apply_edge(fg_median,  edge_method, edge_thr, canny_low_thr, canny_high_thr)
            e_spg = _apply_edge(fsp_gauss,  edge_method, edge_thr, canny_low_thr, canny_high_thr)
            e_spm = _apply_edge(fsp_median, edge_method, edge_thr, canny_low_thr, canny_high_thr)

            # Metrics
            metrics = {
                'psnr_noisy_gaussian':           calc_psnr(original, n_gauss),
                'psnr_noisy_salt_pepper':         calc_psnr(original, n_sp),
                'psnr_filtered_gauss_gaussian':   calc_psnr(original, fg_gauss),
                'psnr_filtered_gauss_median':     calc_psnr(original, fg_median),
                'psnr_filtered_sp_gaussian':      calc_psnr(original, fsp_gauss),
                'psnr_filtered_sp_median':        calc_psnr(original, fsp_median),
                'mse_noisy_gaussian':             calc_mse(original, n_gauss),
                'mse_noisy_salt_pepper':          calc_mse(original, n_sp),
                'mse_filtered_gauss_gaussian':    calc_mse(original, fg_gauss),
                'mse_filtered_gauss_median':      calc_mse(original, fg_median),
                'mse_filtered_sp_gaussian':       calc_mse(original, fsp_gauss),
                'mse_filtered_sp_median':         calc_mse(original, fsp_median),
                'ssim_noisy_gaussian':            calc_ssim(original, n_gauss),
                'ssim_filtered_gauss_gaussian':   calc_ssim(original, fg_gauss),
                'ssim_filtered_gauss_median':     calc_ssim(original, fg_median),
                'ssim_filtered_sp_gaussian':      calc_ssim(original, fsp_gauss),
                'ssim_filtered_sp_median':        calc_ssim(original, fsp_median),
                'edge_count_gauss_gaussian':      count_edges(e_gg),
                'edge_count_gauss_median':        count_edges(e_gm),
                'edge_count_sp_gaussian':         count_edges(e_spg),
                'edge_count_sp_median':           count_edges(e_spm),
                'edge_density_gauss_gaussian':    calc_edge_density(e_gg),
                'edge_density_gauss_median':      calc_edge_density(e_gm),
                'edge_density_sp_gaussian':       calc_edge_density(e_spg),
                'edge_density_sp_median':         calc_edge_density(e_spm),
            }

            analysis = build_analysis(metrics)
            ms = round((time.time() - t0) * 1000)

            histograms = {
                'original':              calc_histogram(original),
                'noisy_gaussian':        calc_histogram(n_gauss),
                'noisy_salt_pepper':     calc_histogram(n_sp),
                'filtered_gauss_gaussian': calc_histogram(fg_gauss),
                'filtered_gauss_median':   calc_histogram(fg_median),
            }

            self._json(200, {
                'success': True,
                'processing_time_ms': ms,
                'images': {
                    'original':                     to_jpeg_b64(original),
                    'noisy_gaussian':               to_jpeg_b64(n_gauss),
                    'noisy_salt_pepper':            to_jpeg_b64(n_sp),
                    'filtered_gauss_gaussian':      to_jpeg_b64(fg_gauss),
                    'filtered_gauss_median':        to_jpeg_b64(fg_median),
                    'filtered_sp_gaussian':         to_jpeg_b64(fsp_gauss),
                    'filtered_sp_median':           to_jpeg_b64(fsp_median),
                    'edge_gauss_filtered_gaussian': to_jpeg_b64(e_gg),
                    'edge_gauss_filtered_median':   to_jpeg_b64(e_gm),
                    'edge_sp_filtered_gaussian':    to_jpeg_b64(e_spg),
                    'edge_sp_filtered_median':      to_jpeg_b64(e_spm),
                },
                'metrics': metrics,
                'analysis': analysis,
                'histograms': histograms,
            })

        except MemoryError:
            self._json(413, {'success': False, 'error_code': 'TOO_LARGE',
                             'error_message': 'Gambar terlalu besar. Coba gambar lebih kecil.'})
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
