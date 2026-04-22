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

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const neighborsR: number[] = [];
      const neighborsG: number[] = [];
      const neighborsB: number[] = [];

      for (let fy = -half; fy <= half; fy++) {
        for (let fx = -half; fx <= half; fx++) {
          const nx = Math.min(width - 1, Math.max(0, x + fx));
          const ny = Math.min(height - 1, Math.max(0, y + fy));
          const idx = (ny * width + nx) * 4;
          neighborsR.push(data[idx]);
          neighborsG.push(data[idx + 1]);
          neighborsB.push(data[idx + 2]);
        }
      }

      neighborsR.sort((a, b) => a - b);
      neighborsG.sort((a, b) => a - b);
      neighborsB.sort((a, b) => a - b);

      const mid = Math.floor(neighborsR.length / 2);
      const tidx = (y * width + x) * 4;
      target[tidx] = neighborsR[mid];
      target[tidx + 1] = neighborsG[mid];
      target[tidx + 2] = neighborsB[mid];
    }
  }
  return result;
};

export const applyMeanFilter = (imgData: ImageDataWrapper, size: number = 3): ImageDataWrapper => {
  const result = copyImageData(imgData);
  const { data, width, height } = imgData;
  const target = result.data;
  const half = Math.floor(size / 2);
  const total = size * size;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0;

      for (let fy = -half; fy <= half; fy++) {
        for (let fx = -half; fx <= half; fx++) {
          const nx = Math.min(width - 1, Math.max(0, x + fx));
          const ny = Math.min(height - 1, Math.max(0, y + fy));
          const idx = (ny * width + nx) * 4;
          sumR += data[idx];
          sumG += data[idx + 1];
          sumB += data[idx + 2];
        }
      }

      const tidx = (y * width + x) * 4;
      target[tidx] = sumR / total;
      target[tidx + 1] = sumG / total;
      target[tidx + 2] = sumB / total;
    }
  }
  return result;
};

// --- Edge Detection ---

export const applySobelOperator = (imgData: ImageDataWrapper): ImageDataWrapper => {
  const { data, width, height } = imgData;
  const grayscale = new Uint8ClampedArray(width * height);
  
  // Convert to grayscale first for easier processing
  for (let i = 0; i < data.length; i += 4) {
    grayscale[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  const result = copyImageData(imgData);
  const target = result.data;

  const kx = [
    -1, 0, 1,
    -2, 0, 2,
    -1, 0, 1
  ];
  const ky = [
    -1, -2, -1,
     0,  0,  0,
     1,  2,  1
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;

      for (let fy = -1; fy <= 1; fy++) {
        for (let fx = -1; fx <= 1; fx++) {
          const val = grayscale[(y + fy) * width + (x + fx)];
          gx += val * kx[(fy + 1) * 3 + (fx + 1)];
          gy += val * ky[(fy + 1) * 3 + (fx + 1)];
        }
      }

      const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      const tidx = (y * width + x) * 4;
      target[tidx] = mag;
      target[tidx + 1] = mag;
      target[tidx + 2] = mag;
      target[tidx + 3] = 255;
    }
  }
  return result;
};
