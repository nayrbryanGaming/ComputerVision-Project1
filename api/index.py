import time
import base64
import numpy as np
import cv2
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

app = FastAPI()

class ImageProcessRequest(BaseModel):
    image_base64: str
    noise_type: str  # 'gaussian' or 'salt_and_pepper'
    intensity: float # 0.1 to 0.3
    sigma: float = 1.0
    kernel_size: int = 5

def base64_to_cv2(base64_string: str) -> np.ndarray:
    """Konversi string base64 kembali menjadi format NumPy array (BGR)."""
    try:
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        img_data = base64.b64decode(base64_string)
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        raise ValueError(f"Gagal decode image: {e}")

def cv2_to_base64(img: np.ndarray) -> str:
    """Konversi NumPy array (BGR) menjadi string base64 untuk dikirim ke Frontend."""
    _, buffer = cv2.imencode('.png', img)
    base64_str = base64.b64encode(buffer).decode('utf-8')
    return f"data:image/png;base64,{base64_str}"

# ==============================================================================
# CORE IMAGE PROCESSING ENGINE (PURE MANUAL LOGIC)
# Bagian ini adalah bukti pengerjaan algoritma secara manual tanpa library hitam.
# ==============================================================================

def add_manual_gaussian_noise(image: np.ndarray, intensity: float) -> np.ndarray:
    """
    Menambahkan Gaussian Noise secara manual.
    Rumus: I_noisy = I_orig + N(mean, sigma)
    """
    row, col, ch = image.shape
    mean = 0
    # Memetakan intensitas 0.1-0.3 ke standar deviasi (sigma)
    sigma = intensity * 100 
    gauss = np.random.normal(mean, sigma, (row, col, ch))
    noisy = image.astype(np.float32) + gauss
    return np.clip(noisy, 0, 255).astype(np.uint8)

def add_manual_sp_noise(image: np.ndarray, intensity: float) -> np.ndarray:
    """
    Menambahkan Salt & Pepper Noise secara manual.
    Menggunakan matriks probabilitas acak untuk menentukan titik noise.
    """
    out = np.copy(image)
    prob = intensity
    # Generate random matrix untuk koordinat noise
    rnd = np.random.random(image.shape[:2])
    
    # Salt noise (titik putih) - probabilitas setara setengah intensitas
    out[rnd < prob/2] = [255, 255, 255]
    # Pepper noise (titik hitam) - probabilitas setara setengah intensitas sisanya
    out[rnd > 1 - prob/2] = [0, 0, 0]
    return out

def apply_manual_convolution(image: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    """
    Engine Konvolusi Manual.
    Melakukan perkalian dot product antara kernel dan sliding window citra.
    Optimasi menggunakan pergeseran NumPy untuk kecepatan (tetap logic manual).
    """
    hi, wi, channels = image.shape
    hk, wk = kernel.shape
    
    # Padding agar dimensi output sama dengan input (Same Padding)
    pad_h, pad_w = hk // 2, wk // 2
    padded = np.pad(image, ((pad_h, pad_h), (pad_w, pad_w), (0, 0)), mode='edge')
    
    output = np.zeros_like(image, dtype=np.float32)
    # Loop koordinat kernel (Logic Inti Konvolusi)
    for i in range(hk):
        for j in range(wk):
            # Pergeseran matriks untuk menghindari triple nested loop Python yang lambat
            output += padded[i:i+hi, j:j+wi, :] * kernel[i, j]
            
    return np.clip(output, 0, 255).astype(np.uint8)

def apply_manual_gaussian_filter(image: np.ndarray, sigma: float = 1.0) -> np.ndarray:
    """
    Implementasi Manual Gaussian Filter.
    1. Generate Gaussian Kernel 2D secara dinamis berdasarkan sigma.
    2. Terapkan konvolusi manual.
    """
    size = int(6 * sigma + 1)
    if size % 2 == 0: size += 1
    size = max(3, min(size, 15)) # Batasi size untuk performa browser
    
    # Generate 1D Gaussian
    ax = np.linspace(-(size // 2), size // 2, size)
    gauss_1d = np.exp(-0.5 * np.square(ax) / np.square(sigma))
    # Outer product untuk mendapatkan 2D Gaussian Kernel
    kernel = np.outer(gauss_1d, gauss_1d)
    # Normalisasi kernel (jumlah total harus 1)
    kernel = kernel / np.sum(kernel)
    
    return apply_manual_convolution(image, kernel.astype(np.float32))

def apply_manual_median_filter(image: np.ndarray, size: int = 5) -> np.ndarray:
    """
    Implementasi Manual Median Filter.
    Mengambil nilai tengah (median) dari pixel di sekitar window.
    Sangat efektif untuk Noise Salt & Pepper.
    """
    size = max(3, min(size, 11))
    hi, wi, channels = image.shape
    pad = size // 2
    padded = np.pad(image, ((pad, pad), (pad, pad), (0, 0)), mode='edge')
    
    output = np.zeros_like(image)
    
    # Gunakan sliding_window_view untuk efisiensi komputasi di Python
    for c in range(channels):
        # Ambil semua window berukuran (size, size) sekaligus
        windows = np.lib.stride_tricks.sliding_window_view(padded[:, :, c], (size, size))
        # Hitung median pada sumbu window
        output[:, :, c] = np.median(windows, axis=(2, 3))
        
    return output.astype(np.uint8)

def apply_manual_sobel(image: np.ndarray) -> np.ndarray:
    """
    Implementasi Manual Sobel Edge Detection.
    1. Konversi ke Grayscale secara manual (NTSC weights).
    2. Deteksi gradien horizontal (Gx) dan vertikal (Gy).
    3. Hitung magnitude gradien.
    """
    # Manual Grayscale Conversion: Y = 0.299R + 0.587G + 0.114B
    gray = np.dot(image[...,:3], [0.2989, 0.5870, 0.1140]).astype(np.float32)
    hi, wi = gray.shape
    
    # Kernel Sobel (Gx & Gy)
    Kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
    Ky = np.array([[1, 2, 1], [0, 0, 0], [-1, -2, -1]], dtype=np.float32)
    
    padded = np.pad(gray, ((1, 1), (1, 1)), mode='edge')
    grad_x = np.zeros_like(gray)
    grad_y = np.zeros_like(gray)
    
    # Konvolusi Sobel
    for i in range(3):
        for j in range(3):
            grad_x += padded[i:i+hi, j:j+wi] * Kx[i, j]
            grad_y += padded[i:i+hi, j:j+wi] * Ky[i, j]
            
    # Hitung Magnitude (Kedalaman Tepi)
    magnitude = np.sqrt(grad_x**2 + grad_y**2)
    # Normalisasi ke 0-255
    if magnitude.max() > 0:
        magnitude = (magnitude / magnitude.max() * 255).astype(np.uint8)
    else:
        magnitude = magnitude.astype(np.uint8)
    
    # Kembalikan ke 3 channel (grayscale RGB) agar kompatibel dengan UI
    return cv2.cvtColor(magnitude, cv2.COLOR_GRAY2BGR)

@app.post("/api/process")
async def process_image(req: ImageProcessRequest):
    start_total = time.time()
    timings = {}

    try:
        # 1. Decode Image
        t0 = time.time()
        img = base64_to_cv2(req.image_base64)
        timings['decode'] = round((time.time() - t0) * 1000, 2)
        
        # 2. Noise Generation
        t1 = time.time()
        if req.noise_type == 'gaussian':
            noisy = add_manual_gaussian_noise(img, req.intensity)
        else:
            noisy = add_manual_sp_noise(img, req.intensity)
        timings['noise'] = round((time.time() - t1) * 1000, 2)
            
        # 3. Filtering
        t2 = time.time()
        filter_a = apply_manual_gaussian_filter(noisy, req.sigma)
        filter_b = apply_manual_median_filter(noisy, req.kernel_size)
        timings['filtering'] = round((time.time() - t2) * 1000, 2)
        
        # 4. Edge Detection
        t3 = time.time()
        edge_a = apply_manual_sobel(filter_a)
        edge_b = apply_manual_sobel(filter_b)
        timings['edges'] = round((time.time() - t3) * 1000, 2)
        
        # 5. Encode Results
        t4 = time.time()
        result = {
            "noisy": cv2_to_base64(noisy),
            "filterA": cv2_to_base64(filter_a),
            "filterB": cv2_to_base64(filter_b),
            "edgeA": cv2_to_base64(edge_a),
            "edgeB": cv2_to_base64(edge_b),
            "timings": timings,
            "total_ms": round((time.time() - start_total) * 1000, 2)
        }
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
