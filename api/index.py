from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
import cv2
import base64

app = FastAPI()

class ImageProcessRequest(BaseModel):
    image_base64: str
    noise_type: str  # 'gaussian' or 'salt_and_pepper'
    intensity: float # 0.1 to 0.3

def base64_to_cv2(base64_string: str) -> np.ndarray:
    try:
        # Menghapus header prefix seperti 'data:image/png;base64,'
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        img_data = base64.b64decode(base64_string)
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        raise ValueError(f"Failed to decode image: {e}")

def cv2_to_base64(img: np.ndarray) -> str:
    # Convert numpy array back to base64
    _, buffer = cv2.imencode('.png', img)
    base64_str = base64.b64encode(buffer).decode('utf-8')
    return f"data:image/png;base64,{base64_str}"

def add_gaussian_noise(image: np.ndarray, intensity: float) -> np.ndarray:
    row, col, ch = image.shape
    mean = 0
    var = (intensity * 255) ** 2
    sigma = var ** 0.5
    noise = np.random.normal(mean, sigma, (row, col, ch))
    noisy = np.clip(image + noise, 0, 255).astype(np.uint8)
    return noisy

def add_salt_and_pepper_noise(image: np.ndarray, intensity: float) -> np.ndarray:
    row, col, ch = image.shape
    s_vs_p = 0.5
    amount = intensity
    out = np.copy(image)
    
    # Salt mode
    num_salt = np.ceil(amount * image.size * s_vs_p)
    coords = [np.random.randint(0, i - 1, int(num_salt)) for i in image.shape]
    out[tuple(coords)] = 255

    # Pepper mode
    num_pepper = np.ceil(amount * image.size * (1. - s_vs_p))
    coords = [np.random.randint(0, i - 1, int(num_pepper)) for i in image.shape]
    out[tuple(coords)] = 0
    return out

@app.post("/api/process")
async def process_image(req: ImageProcessRequest):
    try:
        # 1. Decode Image
        original_img = base64_to_cv2(req.image_base64)
        
        # 2. Add Noise
        if req.noise_type == 'gaussian':
            noisy_img = add_gaussian_noise(original_img, req.intensity)
        else:
            noisy_img = add_salt_and_pepper_noise(original_img, req.intensity)
            
        # 3. Apply Filters
        # Gaussian Filter (5x5 kernel)
        filter_a_img = cv2.GaussianBlur(noisy_img, (5, 5), 0)
        
        # Median Filter (5x5 kernel)
        filter_b_img = cv2.medianBlur(noisy_img, 5)
        
        # 4. Edge Detection (Sobel)
        def apply_sobel(img):
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            grad_x = cv2.Sobel(gray, cv2.CV_16S, 1, 0, ksize=3)
            grad_y = cv2.Sobel(gray, cv2.CV_16S, 0, 1, ksize=3)
            abs_grad_x = cv2.convertScaleAbs(grad_x)
            abs_grad_y = cv2.convertScaleAbs(grad_y)
            sobel = cv2.addWeighted(abs_grad_x, 0.5, abs_grad_y, 0.5, 0)
            return cv2.cvtColor(sobel, cv2.COLOR_GRAY2BGR)
            
        edge_a_img = apply_sobel(filter_a_img)
        edge_b_img = apply_sobel(filter_b_img)
        
        # 5. Convert Results to Base64
        return {
            "noisy": cv2_to_base64(noisy_img),
            "filterA": cv2_to_base64(filter_a_img),
            "filterB": cv2_to_base64(filter_b_img),
            "edgeA": cv2_to_base64(edge_a_img),
            "edgeB": cv2_to_base64(edge_b_img),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
