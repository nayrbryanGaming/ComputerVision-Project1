export interface ImageState {
  original: string;
  noisy: string;
  filterA: string;
  filterB: string;
  edgeA: string;
  edgeB: string;
  timings?: any;
  total_ms?: number;
}

export async function processImagePython(
  file: File | string,
  noiseType: 'gaussian' | 'salt_and_pepper',
  intensity: number,
  sigma: number = 1.0,
  kernelSize: number = 5
): Promise<ImageState> {
  // Load and resize image first to avoid sending giant payloads to the server
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  
  // Smart Resizing: Max 800px to ensure <200ms processing and low network payload
  const maxDim = 800; 
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
  
  // Use JPEG with 0.8 quality for the upload to significantly reduce base64 string size
  const originalUrl = canvas.toDataURL('image/jpeg', 0.8); 

  // Send to Python API (Vercel Serverless Function)
  const response = await fetch('/api/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_base64: originalUrl,
      noise_type: noiseType,
      intensity: intensity,
      sigma: sigma,
      kernel_size: kernelSize
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision Engine Error: ${response.status} - ${errorText || 'Internal logic failure'}`);
  }

  const result = await response.json();

  return {
    original: originalUrl,
    noisy: result.noisy,
    filterA: result.filterA,
    filterB: result.filterB,
    edgeA: result.edgeA,
    edgeB: result.edgeB,
    timings: result.timings,
    total_ms: result.total_ms
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
