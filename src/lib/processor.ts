export interface ImageDataWrapper {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export const copyImageData = (imgData: ImageDataWrapper): ImageDataWrapper => {
  return {
    data: new Uint8ClampedArray(imgData.data),
    width: imgData.width,
    height: imgData.height,
  };
};

// --- Utilities ---

export const resizeImageData = (imgData: ImageDataWrapper, maxDim: number = 800): ImageDataWrapper => {
  if (imgData.width <= maxDim && imgData.height <= maxDim) return imgData;

  const scale = Math.min(maxDim / imgData.width, maxDim / imgData.height);
  const newWidth = Math.floor(imgData.width * scale);
  const newHeight = Math.floor(imgData.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = imgData.width;
  canvas.height = imgData.height;
  const ctx = canvas.getContext('2d')!;
  const imageData = new ImageData(imgData.data as any, imgData.width, imgData.height);
  ctx.putImageData(imageData, 0, 0);

  const offscreen = document.createElement('canvas');
  offscreen.width = newWidth;
  offscreen.height = newHeight;
  const oCtx = offscreen.getContext('2d')!;
  oCtx.drawImage(canvas, 0, 0, newWidth, newHeight);

  const finalData = oCtx.getImageData(0, 0, newWidth, newHeight);
  return {
    data: finalData.data,
    width: newWidth,
    height: newHeight,
  };
};

// --- Noise Generation ---

export const addSaltAndPepperNoise = (imgData: ImageDataWrapper, density: number): ImageDataWrapper => {
  const result = copyImageData(imgData);
  const data = result.data;
  const count = Math.floor(density * result.width * result.height);

  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * result.width);
    const y = Math.floor(Math.random() * result.height);
    const index = (y * result.width + x) * 4;
    const val = Math.random() < 0.5 ? 0 : 255;
    data[index] = val;
    data[index + 1] = val;
    data[index + 2] = val;
  }
  return result;
};

export const addGaussianNoise = (imgData: ImageDataWrapper, stdDev: number): ImageDataWrapper => {
  const result = copyImageData(imgData);
  const data = result.data;

  const boxMullerTransform = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };

  for (let i = 0; i < data.length; i += 4) {
    const noise = boxMullerTransform() * stdDev;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  return result;
};

// --- Filters ---

export const applyMedianFilter = (imgData: ImageDataWrapper, size: number = 3): ImageDataWrapper => {
  const result = copyImageData(imgData);
  const { data, width, height } = imgData;
  const target = result.data;
  const half = Math.floor(size / 2);
  const window = new Uint8Array(size * size);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let k = 0;
        for (let fy = -half; fy <= half; fy++) {
          for (let fx = -half; fx <= half; fx++) {
            const nx = Math.min(width - 1, Math.max(0, x + fx));
            const ny = Math.min(height - 1, Math.max(0, y + fy));
            window[k++] = data[(ny * width + nx) * 4 + c];
          }
        }
        window.sort();
        target[(y * width + x) * 4 + c] = window[Math.floor(window.length / 2)];
      }
    }
  }
  return result;
};

export const applyGaussianFilter = (imgData: ImageDataWrapper, sigma: number = 1.0): ImageDataWrapper => {
  const size = Math.ceil(sigma * 3) * 2 + 1;
  const kernel = new Float32Array(size * size);
  const half = Math.floor(size / 2);
  let sum = 0;

  for (let y = -half; y <= half; y++) {
    for (let x = -half; x <= half; x++) {
      const g = Math.exp(-(x * x + y * y) / (2 * sigma * sigma)) / (2 * Math.PI * sigma * sigma);
      kernel[(y + half) * size + (x + half)] = g;
      sum += g;
    }
  }

  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const result = copyImageData(imgData);
  const { data, width, height } = imgData;
  const target = result.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let fy = -half; fy <= half; fy++) {
        for (let fx = -half; fx <= half; fx++) {
          const nx = Math.min(width - 1, Math.max(0, x + fx));
          const ny = Math.min(height - 1, Math.max(0, y + fy));
          const weight = kernel[(fy + half) * size + (fx + half)];
          const idx = (ny * width + nx) * 4;
          r += data[idx] * weight;
          g += data[idx + 1] * weight;
          b += data[idx + 2] * weight;
        }
      }
      const tidx = (y * width + x) * 4;
      target[tidx] = r;
      target[tidx + 1] = g;
      target[tidx + 2] = b;
    }
  }
  return result;
};

// --- Edge Detection ---

export const applySobelOperator = (imgData: ImageDataWrapper): ImageDataWrapper => {
  const { data, width, height } = imgData;
  const grayscale = new Uint8ClampedArray(width * height);
  
  for (let i = 0; i < data.length; i += 4) {
    grayscale[i / 4] = (data[i] + data[i+1] + data[i+2]) / 3;
  }

  const result = copyImageData(imgData);
  const target = result.data;

  const kx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const ky = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      for (let fy = -1; fy <= 1; fy++) {
        for (let fx = -1; fx <= 1; fx++) {
          const val = grayscale[(y + fy) * width + (x + fx)];
          gx += val * kx[(fy + 1) * 3 + (fx + 1)];
          gy += val * ky[(fy + 1) * 3 + (fx + 1)];
        }
      }

      const mag = Math.sqrt(gx * gx + gy * gy);
      const tidx = (y * width + x) * 4;
      const pixelVal = Math.min(255, mag);
      target[tidx] = pixelVal;
      target[tidx + 1] = pixelVal;
      target[tidx + 2] = pixelVal;
      target[tidx + 3] = 255;
    }
  }
  return result;
};
