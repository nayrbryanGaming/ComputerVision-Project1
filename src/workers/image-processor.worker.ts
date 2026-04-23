
self.onmessage = (e: MessageEvent) => {
  const { imageData, type, params } = e.data;
  const { width, height, data } = imageData;
  const resultData = new Uint8ClampedArray(data);

  switch (type) {
    case 'noise_gaussian':
      addGaussianNoise(resultData, params.intensity);
      break;
    case 'noise_salt_and_pepper':
      addSaltAndPepperNoise(resultData, params.intensity);
      break;
    case 'filter_gaussian':
      applyGaussianFilter(resultData, width, height);
      break;
    case 'filter_median':
      applyMedianFilter(resultData, width, height);
      break;
    case 'edge_sobel':
      applySobelFilter(resultData, width, height);
      break;
  }

  self.postMessage({ imageData: new ImageData(resultData, width, height) }, [resultData.buffer] as any);
};

function addGaussianNoise(data: Uint8ClampedArray, intensity: number) {
  const amount = intensity * 100;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() * 2 - 1) * amount;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
}

function addSaltAndPepperNoise(data: Uint8ClampedArray, intensity: number) {
  for (let i = 0; i < data.length; i += 4) {
    if (Math.random() < intensity) {
      const color = Math.random() < 0.5 ? 0 : 255;
      data[i] = color;
      data[i + 1] = color;
      data[i + 2] = color;
    }
  }
}

function applyGaussianFilter(data: Uint8ClampedArray, width: number, height: number) {
  const kernel = [
    1/16, 2/16, 1/16,
    2/16, 4/16, 2/16,
    1/16, 2/16, 1/16
  ];
  applyConvolution(data, width, height, kernel);
}

function applyConvolution(data: Uint8ClampedArray, width: number, height: number, kernel: number[]) {
  const side = Math.round(Math.sqrt(kernel.length));
  const halfSide = Math.floor(side / 2);
  const src = new Uint8ClampedArray(data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let cy = 0; cy < side; cy++) {
        for (let cx = 0; cx < side; cx++) {
          const scy = y + cy - halfSide;
          const scx = x + cx - halfSide;
          if (scy >= 0 && scy < height && scx >= 0 && scx < width) {
            const srcIdx = (scy * width + scx) * 4;
            const wt = kernel[cy * side + cx];
            r += src[srcIdx] * wt;
            g += src[srcIdx + 1] * wt;
            b += src[srcIdx + 2] * wt;
          }
        }
      }
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
    }
  }
}

function applyMedianFilter(data: Uint8ClampedArray, width: number, height: number) {
  const src = new Uint8ClampedArray(data);
  const size = 1; // 3x3 window

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rs = [], gs = [], bs = [];
      for (let cy = -size; cy <= size; cy++) {
        for (let cx = -size; cx <= size; cx++) {
          const scy = Math.min(height - 1, Math.max(0, y + cy));
          const scx = Math.min(width - 1, Math.max(0, x + cx));
          const idx = (scy * width + scx) * 4;
          rs.push(src[idx]);
          gs.push(src[idx + 1]);
          bs.push(src[idx + 2]);
        }
      }
      rs.sort((a, b) => a - b);
      gs.sort((a, b) => a - b);
      bs.sort((a, b) => a - b);
      const idx = (y * width + x) * 4;
      data[idx] = rs[4];
      data[idx + 1] = gs[4];
      data[idx + 2] = bs[4];
    }
  }
}

function applySobelFilter(data: Uint8ClampedArray, width: number, height: number) {
  const src = new Uint8ClampedArray(data);
  const grayscale = new Uint8ClampedArray(width * height);
  for (let i = 0; i < src.length; i += 4) {
    grayscale[i / 4] = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
  }

  const gx = [
    -1, 0, 1,
    -2, 0, 2,
    -1, 0, 1
  ];
  const gy = [
    -1, -2, -1,
     0,  0,  0,
     1,  2,  1
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let valX = 0;
      let valY = 0;
      for (let cy = -1; cy <= 1; cy++) {
        for (let cx = -1; cx <= 1; cx++) {
          const gVal = grayscale[(y + cy) * width + (x + cx)];
          valX += gVal * gx[(cy + 1) * 3 + (cx + 1)];
          valY += gVal * gy[(cy + 1) * 3 + (cx + 1)];
        }
      }
      const mag = Math.sqrt(valX * valX + valY * valY);
      const idx = (y * width + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = mag > 255 ? 255 : mag;
    }
  }
}
