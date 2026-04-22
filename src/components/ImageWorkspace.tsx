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
  const [showShareToast, setShowShareToast] = useState(false);

  const canvasRefs = {
    original: useRef<HTMLCanvasElement>(null),
    noisy: useRef<HTMLCanvasElement>(null),
    filtered: useRef<HTMLCanvasElement>(null),
    edge: useRef<HTMLCanvasElement>(null),
  };

  // Sync state from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (hash) {
      const params = new URLSearchParams(hash);
      const nt = params.get('nt') as any;
      const nd = parseFloat(params.get('nd') || '0.1');
      const ft = params.get('ft') as any;
      const fs = parseInt(params.get('fs') || '3');
      const imgIdx = parseInt(params.get('img') || '0');

      if (nt) setNoiseType(nt);
      if (nd) setNoiseDensity(nd);
      if (ft) setFilterType(ft);
      if (fs) setFilterSize(fs);
      if (defaultImageUrls[imgIdx]) setSelectedImage(defaultImageUrls[imgIdx]);
    }
  }, [defaultImageUrls]);

  // Update URL hash when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('nt', noiseType);
    params.set('nd', noiseDensity.toString());
    params.set('ft', filterType);
    params.set('fs', filterSize.toString());
    const imgIdx = defaultImageUrls.indexOf(selectedImage);
    if (imgIdx !== -1) params.set('img', imgIdx.toString());
    
    // Use replaceState to avoid cluttering history
    const newHash = params.toString();
    if (window.location.hash !== '#' + newHash) {
      window.history.replaceState(null, '', '#' + newHash);
    }
  }, [noiseType, noiseDensity, filterType, filterSize, selectedImage, defaultImageUrls]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 3000);
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
    const render = (ref: React.RefObject<HTMLCanvasElement | null>, data: proc.ImageDataWrapper) => {
      if (ref.current) {
        const ctx = ref.current.getContext('2d');
        if (ctx) {
          const imgData = new ImageData(data.data as any, data.width, data.height);
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
      <div className="glass-card p-6 md:p-10 mb-10 text-center relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500 opacity-5 blur-[100px] -mr-32 -mt-32"></div>
        
        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="p-4 rounded-full bg-cyan-500 bg-opacity-10 mb-2 border border-cyan-500 border-opacity-20">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <h3 className="text-2xl font-bold tracking-tight">Real-Time CV Experimentation</h3>
          <p className="text-sm opacity-60 max-w-lg">Pilih gambar default atau unggah file Anda sendiri untuk memulai analisis citra secara instan. Hasil akan diperbarui secara real-time saat Anda mengubah parameter.</p>
          
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <label className="cursor-pointer">
              <input 
                type="file" 
                className="hidden" 
                accept="image/*" 
                onChange={handleUpload}
              />
              <span className="button bg-cyan-600 hover:bg-cyan-500 flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-cyan-900/20">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload Gambar
              </span>
            </label>

            {defaultImageUrls.map((url, i) => (
              <button 
                key={i} 
                className={`bg-white hover:bg-opacity-10 border border-white transition-all ${selectedImage === url ? 'bg-opacity-20 border-opacity-40' : 'bg-opacity-5 border-opacity-10'}`} 
                onClick={() => setSelectedImage(url)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Contoh {i + 1}
              </button>
            ))}

            <button 
              className="bg-purple-600 hover:bg-purple-500 flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-purple-900/20"
              onClick={handleShare}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Lock & Share Link
            </button>
          </div>
          
          {showShareToast && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-4 py-2 rounded-full animate-bounce shadow-xl">
              Link Berhasil Disalin!
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-6">
        <Card title="1. Original Image" ref={canvasRefs.original} />
        <Card title={`2. Noisy (${noiseType.replace('_', ' ')})`} ref={canvasRefs.noisy} />
        <Card title={`3. Filtered (${filterType})`} ref={canvasRefs.filtered} />
        <Card title="4. Edge Detection (Sobel)" ref={canvasRefs.edge} accent />
      </div>

      <div className="glass-card p-6 md:p-10 mt-10 grid lg:grid-cols-2 gap-10">
        <div className="controls">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-cyan-500 bg-opacity-10 flex items-center justify-center border border-cyan-500 border-opacity-20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1V15a2 2 0 0 1-2-2 2 2 0 0 1 2-2v-.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </div>
            <h3 className="text-xl font-bold">Parameter Kontrol</h3>
          </div>
          
          <div className="space-y-8">
            <div className="control-group">
              <span className="label uppercase text-[10px] tracking-widest mb-2 inline-block">Jenis Noise Citra</span>
              <div className="flex gap-2">
                <button 
                  className={`flex-1 ${noiseType === 'salt_pepper' ? 'bg-cyan-600 shadow-lg shadow-cyan-900/30' : 'bg-white bg-opacity-5 opacity-40 hover:opacity-100 hover:bg-opacity-10'}`} 
                  onClick={() => setNoiseType('salt_pepper')}
                >
                  Salt & Pepper
                </button>
                <button 
                  className={`flex-1 ${noiseType === 'gaussian' ? 'bg-cyan-600 shadow-lg shadow-cyan-900/30' : 'bg-white bg-opacity-5 opacity-40 hover:opacity-100 hover:bg-opacity-10'}`} 
                  onClick={() => setNoiseType('gaussian')}
                >
                  Gaussian
                </button>
              </div>
            </div>

            <div className="control-group">
              <div className="flex justify-between items-center mb-1">
                <span className="label uppercase text-[10px] tracking-widest">Intensitas Noise</span>
                <span className="text-cyan-400 font-bold text-xs bg-cyan-500 bg-opacity-10 px-2 py-0.5 rounded">{(noiseDensity * 100).toFixed(0)}%</span>
              </div>
              <input 
                type="range" min="0.01" max="0.3" step="0.01" 
                value={noiseDensity} 
                onChange={(e) => setNoiseDensity(parseFloat(e.target.value))} 
                className="w-full cursor-pointer h-1.5 bg-white/10 rounded-lg appearance-none"
              />
            </div>

            <div className="control-group">
              <span className="label uppercase text-[10px] tracking-widest mb-2 inline-block">Metode Reduksi Noise</span>
              <div className="flex gap-2">
                <button 
                  className={`flex-1 ${filterType === 'median' ? 'bg-purple-600 shadow-lg shadow-purple-900/30' : 'bg-white bg-opacity-5 opacity-40 hover:opacity-100 hover:bg-opacity-10'}`} 
                  onClick={() => setFilterType('median')}
                >
                  Median Filter
                </button>
                <button 
                  className={`flex-1 ${filterType === 'mean' ? 'bg-purple-600 shadow-lg shadow-purple-900/30' : 'bg-white bg-opacity-5 opacity-40 hover:opacity-100 hover:bg-opacity-10'}`} 
                  onClick={() => setFilterType('mean')}
                >
                  Mean Filter
                </button>
              </div>
            </div>

            <div className="control-group">
              <div className="flex justify-between items-center mb-1">
                <span className="label uppercase text-[10px] tracking-widest">Ukuran Kernel (Matrix)</span>
                <span className="text-purple-400 font-bold text-xs bg-purple-500 bg-opacity-10 px-2 py-0.5 rounded">{filterSize}x{filterSize}</span>
              </div>
              <input 
                type="range" min="3" max="7" step="2" 
                value={filterSize} 
                onChange={(e) => setFilterSize(parseInt(e.target.value))} 
                className="w-full cursor-pointer h-1.5 bg-white/10 rounded-lg appearance-none"
              />
            </div>
          </div>
        </div>

        <div className="analysis border-l border-white border-opacity-5 pl-0 lg:pl-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-purple-500 bg-opacity-10 flex items-center justify-center border border-purple-500 border-opacity-20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12H10"/></svg>
            </div>
            <h3 className="text-xl font-bold">Analisis Eksperimen</h3>
          </div>
          <div className="space-y-6 text-sm opacity-90 leading-relaxed">
            <div className="bg-white bg-opacity-[0.03] p-6 rounded-2xl border border-white border-opacity-5 hover:bg-opacity-[0.05] transition-all">
              <h5 className="text-cyan-400 font-bold mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                Efektivitas Filtering
              </h5>
              <p className="opacity-70">
                {noiseType === 'salt_pepper' 
                  ? "Untuk Salt & Pepper noise, Median Filter jauh lebih efektif karena ia mengambil nilai tengah dari tetangga, sehingga outlier (pixel hitam/putih murni) akan tereliminasi sepenuhnya tanpa mengaburkan detail."
                  : "Untuk Gaussian noise, Mean Filter memberikan hasil yang lebih halus namun cenderung mengaburkan (blur) gambar. Median filter kurang efektif karena Gaussian noise terdistribusi merata di semua pixel."
                }
              </p>
            </div>

            <div className="bg-white bg-opacity-[0.03] p-6 rounded-2xl border border-white border-opacity-5 hover:bg-opacity-[0.05] transition-all">
              <h5 className="text-purple-400 font-bold mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                Kinerja Deteksi Tepi
              </h5>
              <p className="opacity-70">
                Sobel operator sangat sensitif terhadap noise. 
                {noiseDensity > 0.15 
                  ? " Intensitas noise yang tinggi (>15%) menghasilkan banyak 'false edges' (artefak) jika tidak difilter. Terlihat pada hasil deteksi tepi yang kotor di area background." 
                  : " Dengan filtering yang tepat, garis tepi objek utama terlihat jelas dan kontras, meminimalisir noise gradient yang mengganggu."}
              </p>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${isProcessing ? 'bg-yellow-400 animate-pulse' : 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]'}`}></div>
                <span className="text-[10px] uppercase tracking-tighter opacity-50 font-bold">Engine Status: {isProcessing ? 'Processing' : 'Standby'}</span>
              </div>
              <div className="text-[10px] uppercase tracking-tighter opacity-30 font-bold">
                Manual Implementation v1.0
              </div>
            </div>
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
