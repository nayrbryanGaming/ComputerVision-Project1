
export interface ImageState {
  original: string;
  noisy: string;
  filterA: string;
  filterB: string;
  edgeA: string;
  edgeB: string;
}

export async function processImage(
  file: File | string,
  noiseType: 'gaussian' | 'salt_and_pepper',
  intensity: number
): Promise<ImageState> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  
  // Resize if too large
  const maxDim = 1024;
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
  const originalImageData = ctx.getImageData(0, 0, width, height);
  const originalUrl = canvas.toDataURL();

  const runWorker = (imageData: ImageData, type: string, params: any = {}): Promise<ImageData> => {
    return new Promise((resolve) => {
      const worker = new Worker(new URL('../workers/image-processor.worker.ts', import.meta.url));
      worker.onmessage = (e) => {
        resolve(e.data.imageData);
        worker.terminate();
      };
      worker.postMessage({ imageData, type, params });
    });
  };

  // 1. Add Noise
  const noisyData = await runWorker(cloneImageData(originalImageData), `noise_${noiseType}`, { intensity });
  ctx.putImageData(noisyData, 0, 0);
  const noisyUrl = canvas.toDataURL();

  // 2. Filter A (Gaussian)
  const filterAData = await runWorker(cloneImageData(noisyData), 'filter_gaussian');
  ctx.putImageData(filterAData, 0, 0);
  const filterAUrl = canvas.toDataURL();

  // 3. Filter B (Median)
  const filterBData = await runWorker(cloneImageData(noisyData), 'filter_median');
  ctx.putImageData(filterBData, 0, 0);
  const filterBUrl = canvas.toDataURL();

  // 4. Edge A (from Filter A)
  const edgeAData = await runWorker(cloneImageData(filterAData), 'edge_sobel');
  ctx.putImageData(edgeAData, 0, 0);
  const edgeAUrl = canvas.toDataURL();

  // 5. Edge B (from Filter B)
  const edgeBData = await runWorker(cloneImageData(filterBData), 'edge_sobel');
  ctx.putImageData(edgeBData, 0, 0);
  const edgeBUrl = canvas.toDataURL();

  return {
    original: originalUrl,
    noisy: noisyUrl,
    filterA: filterAUrl,
    filterB: filterBUrl,
    edgeA: edgeAUrl,
    edgeB: edgeBUrl,
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

function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}
