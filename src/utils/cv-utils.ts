export interface ImageState {
  original: string;
  noisy: string;
  filterA: string;
  filterB: string;
  edgeA: string;
  edgeB: string;
}

export async function processImagePython(
  file: File | string,
  noiseType: 'gaussian' | 'salt_and_pepper',
  intensity: number
): Promise<ImageState> {
  // Load and resize image first to avoid sending giant payloads to the server
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  
  const maxDim = 800; // Dikurangi jadi 800px agar payload base64 tidak terlalu besar ke backend
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = (height / width) * maxDim;
      width = maxDim;
    } else {
      width = (width / height) * maxDim;
      height = maxDim;
    }
  }
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);
  const originalUrl = canvas.toDataURL('image/jpeg', 0.8); // Kompresi JPEG untuk mempercepat upload

  // Send to Python API
  const response = await fetch('/api/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_base64: originalUrl,
      noise_type: noiseType,
      intensity: intensity
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();

  return {
    original: originalUrl,
    noisy: result.noisy,
    filterA: result.filterA,
    filterB: result.filterB,
    edgeA: result.edgeA,
    edgeB: result.edgeB,
  };
}

function loadImage(src: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    if (typeof src === 'string') {
      img.src = src;
    } else {
      img.src = URL.createObjectURL(src);
    }
  });
}
