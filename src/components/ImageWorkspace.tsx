'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as proc from '../lib/processor';

interface ImageWorkspaceProps {
  defaultImageUrls: string[];
}

const ImageWorkspace: React.FC<ImageWorkspaceProps> = ({ defaultImageUrls }) => {
  const [selectedImage, setSelectedImage] = useState<string>(defaultImageUrls[0]);
  const [noiseType, setNoiseType] = useState<'salt_pepper' | 'gaussian'>('salt_pepper');
  const [noiseDensity, setNoiseDensity] = useState(0.1);
  const [filterType, setFilterType] = useState<'median' | 'mean'>('median');
  const [filterSize, setFilterSize] = useState(3);
  const [isProcessing, setIsProcessing] = useState(false);

  const canvasRefs = {
    original: useRef<HTMLCanvasElement>(null),
    noisy: useRef<HTMLCanvasElement>(null),
    filtered: useRef<HTMLCanvasElement>(null),
    edge: useRef<HTMLCanvasElement>(null),
  };

  const processImages = useCallback(async () => {
    if (!canvasRefs.original.current) return;
    setIsProcessing(true);

    const ctxOrig = canvasRefs.original.current.getContext('2d');
    if (!ctxOrig) return;

    const { width, height } = canvasRefs.original.current;
    const originalData = ctxOrig.getImageData(0, 0, width, height);
    const wrapper: proc.ImageDataWrapper = {
      data: originalData.data,
      width,
      height,
    };

    // 1. Generate Noise
    let noisy: proc.ImageDataWrapper;
    if (noiseType === 'salt_pepper') {
      noisy = proc.addSaltAndPepperNoise(wrapper, noiseDensity);
    } else {
      noisy = proc.addGaussianNoise(wrapper, noiseDensity * 50); // Scale density for gaussian
    }

    // 2. Apply Filter
    let filtered: proc.ImageDataWrapper;
    if (filterType === 'median') {
      filtered = proc.applyMedianFilter(noisy, filterSize);
    } else {
      filtered = proc.applyMeanFilter(noisy, filterSize);
    }

    // 3. Edge Detection
    const edges = proc.applySobelOperator(filtered);

    // Render to canvases
    const render = (ref: React.RefObject<HTMLCanvasElement>, data: proc.ImageDataWrapper) => {
      if (ref.current) {
        const ctx = ref.current.getContext('2d');
        if (ctx) {
          const imgData = new ImageData(data.data, data.width, data.height);
          ctx.putImageData(imgData, 0, 0);
        }
      }
    };

    render(canvasRefs.noisy, noisy);
    render(canvasRefs.filtered, filtered);
    render(canvasRefs.edge, edges);

    setIsProcessing(false);
  }, [noiseType, noiseDensity, filterType, filterSize]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = selectedImage;
    img.onload = () => {
      const canvases = Object.values(canvasRefs);
      canvases.forEach(ref => {
        if (ref.current) {
          ref.current.width = img.width;
          ref.current.height = img.height;
        }
      });

      const ctx = canvasRefs.original.current?.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        processImages();
      }
    };
  }, [selectedImage, processImages]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setSelectedImage(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="glass-card upload-zone mb-8">
        <h3 className="mb-4">Real-Time Experimentation</h3>
        <p className="text-sm opacity-70 mb-6">Upload your own image or select a default to begin the analysis.</p>
        <div className="flex flex-wrap justify-center gap-4">
          <input 
            type="file" 
            id="file-upload" 
            className="hidden" 
            accept="image/*" 
            onChange={handleUpload}
          />
          <button onClick={() => document.getElementById('file-upload')?.click()}>
            Upload Custom Image
          </button>
          {defaultImageUrls.map((url, i) => (
            <button 
              key={i} 
              className="bg-opacity-20 border border-white border-opacity-10" 
              onClick={() => setSelectedImage(url)}
            >
              Default Example {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-6">
        <Card title="1. Original" ref={canvasRefs.original} />
        <Card title={`2. Noisy (${noiseType.replace('_', ' ')})`} ref={canvasRefs.noisy} />
        <Card title={`3. Filtered (${filterType})`} ref={canvasRefs.filtered} />
        <Card title="4. Edge Detection (Sobel)" ref={canvasRefs.edge} accent />
      </div>

      <div className="glass-card p-8 mt-12 grid md:grid-cols-2 gap-12">
        <div className="controls">
          <h3 className="glow-text mb-4">Parameters</h3>
          
          <div className="control-group">
            <span className="label">Noise Type</span>
            <div className="flex gap-2">
              <button 
                className={noiseType === 'salt_pepper' ? '' : 'opacity-40'} 
                onClick={() => setNoiseType('salt_pepper')}
              >
                Salt & Pepper
              </button>
              <button 
                className={noiseType === 'gaussian' ? '' : 'opacity-40'} 
                onClick={() => setNoiseType('gaussian')}
              >
                Gaussian
              </button>
            </div>
          </div>

          <div className="control-group">
            <span className="label">Noise Density: {(noiseDensity * 100).toFixed(0)}%</span>
            <input 
              type="range" min="0.01" max="0.3" step="0.01" 
              value={noiseDensity} 
              onChange={(e) => setNoiseDensity(parseFloat(e.target.value))} 
            />
          </div>

          <div className="control-group">
            <span className="label">Filter Type</span>
            <div className="flex gap-2">
              <button 
                className={filterType === 'median' ? '' : 'opacity-40'} 
                onClick={() => setFilterType('median')}
              >
                Median Filter
              </button>
              <button 
                className={filterType === 'mean' ? '' : 'opacity-40'} 
                onClick={() => setFilterType('mean')}
              >
                Mean Filter
              </button>
            </div>
          </div>

          <div className="control-group">
            <span className="label">Filter Size: {filterSize}x{filterSize}</span>
            <input 
              type="range" min="3" max="7" step="2" 
              value={filterSize} 
              onChange={(e) => setFilterSize(parseInt(e.target.value))} 
            />
          </div>
        </div>

        <div className="analysis">
          <h3 className="mb-4">Live Analysis</h3>
          <div className="space-y-4 text-sm opacity-80 leading-relaxed">
            <p>
              <strong>Effectiveness:</strong> {noiseType === 'salt_pepper' 
                ? "Untuk Salt & Pepper noise, Median Filter jauh lebih efektif karena ia mengambil nilai tengah dari tetangga, sehingga outlier (pixel hitam/putih murni) akan tereliminasi sepenuhnya."
                : "Untuk Gaussian noise, Mean Filter memberikan hasil yang lebih halus namun cenderung mengaburkan (blur) gambar. Median filter kurang efektif di sini karena noise terdistribusi merata di semua pixel."
              }
            </p>
            <p>
              <strong>Edge Detection:</strong> Sobel operator sangat sensitif terhadap noise. 
              {noiseDensity > 0.15 ? " Dengan noise yang tinggi, deteksi tepi menghasilkan banyak 'false edges' (artefak) jika tidak difilter dengan baik." : " Dengan filtering yang tepat, garis tepi objek utama terlihat jelas dan kontras."}
            </p>
            <p className="text-xs italic">
              *Real-time processing active. Status: {isProcessing ? 'Processing...' : 'Idle'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Card = React.forwardRef<HTMLCanvasElement, { title: string; accent?: boolean }>(({ title, accent }, ref) => (
  <div className={`glass-card p-4 flex flex-col gap-4 ${accent ? 'border-accent border-opacity-50' : ''}`}>
    <h4 className="text-center font-bold text-sm uppercase tracking-wider">{title}</h4>
    <div className="canvas-container">
      <canvas ref={ref} />
    </div>
  </div>
));

Card.displayName = 'Card';

export default ImageWorkspace;
