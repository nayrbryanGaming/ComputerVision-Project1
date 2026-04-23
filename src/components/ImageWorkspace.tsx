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
  const [sigma, setSigma] = useState(1.5);
  const [medianSize, setMedianSize] = useState(3);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);

  const canvasRefs = {
    original: useRef<HTMLCanvasElement>(null),
    noisy: useRef<HTMLCanvasElement>(null),
    gaussian: useRef<HTMLCanvasElement>(null),
    median: useRef<HTMLCanvasElement>(null),
    edgeG: useRef<HTMLCanvasElement>(null),
    edgeM: useRef<HTMLCanvasElement>(null),
  };

  // Sync state from URL hash on mount
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.substring(1) : '';
    if (hash) {
      const params = new URLSearchParams(hash);
      const nt = params.get('nt') as any;
      const nd = parseFloat(params.get('nd') || '0.1');
      const sig = parseFloat(params.get('sig') || '1.5');
      const ms = parseInt(params.get('ms') || '3');
      const imgIdx = parseInt(params.get('img') || '0');

      if (nt) setNoiseType(nt);
      if (nd) setNoiseDensity(nd);
      if (sig) setSigma(sig);
      if (ms) setMedianSize(ms);
      if (defaultImageUrls[imgIdx]) setSelectedImage(defaultImageUrls[imgIdx]);
    }
  }, [defaultImageUrls]);

  // Update URL hash when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('nt', noiseType);
    params.set('nd', noiseDensity.toString());
    params.set('sig', sigma.toString());
    params.set('ms', medianSize.toString());
    const imgIdx = defaultImageUrls.indexOf(selectedImage);
    if (imgIdx !== -1) params.set('img', imgIdx.toString());
    
    const newHash = params.toString();
    if (typeof window !== 'undefined' && window.location.hash !== '#' + newHash) {
      window.history.replaceState(null, '', '#' + newHash);
    }
  }, [noiseType, noiseDensity, sigma, medianSize, selectedImage, defaultImageUrls]);

  const handleShare = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 3000);
    }
  };

  const processImages = useCallback(async (baseWrapper: proc.ImageDataWrapper) => {
    setIsProcessing(true);

    // 1. Generate Noise
    let noisy: proc.ImageDataWrapper;
    if (noiseType === 'salt_pepper') {
      noisy = proc.addSaltAndPepperNoise(baseWrapper, noiseDensity);
    } else {
      noisy = proc.addGaussianNoise(baseWrapper, noiseDensity * 50);
    }

    // 2. Apply Filters (PIPELINE STEP 3)
    const gaussianFiltered = proc.applyGaussianFilter(noisy, sigma);
    const medianFiltered = proc.applyMedianFilter(noisy, medianSize);

    // 3. Edge Detection (PIPELINE STEP 4)
    const edgesG = proc.applySobelOperator(gaussianFiltered);
    const edgesM = proc.applySobelOperator(medianFiltered);

    // Render to canvases
    const render = (ref: React.RefObject<HTMLCanvasElement | null>, data: proc.ImageDataWrapper) => {
      if (ref.current) {
        ref.current.width = data.width;
        ref.current.height = data.height;
        const ctx = ref.current.getContext('2d');
        if (ctx) {
          // FIX: Explicit cast and new instance to avoid TypeScript errors in some environments
          const imgData = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
          ctx.putImageData(imgData, 0, 0);
        }
      }
    };

    render(canvasRefs.noisy, noisy);
    render(canvasRefs.gaussian, gaussianFiltered);
    render(canvasRefs.median, medianFiltered);
    render(canvasRefs.edgeG, edgesG);
    render(canvasRefs.edgeM, edgesM);

    setIsProcessing(false);
  }, [noiseType, noiseDensity, sigma, medianSize]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = selectedImage;
    img.onload = () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const ctx = tempCanvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      let wrapper: proc.ImageDataWrapper = {
        data: ctx.getImageData(0, 0, img.width, img.height).data,
        width: img.width,
        height: img.height,
      };

      // CRITICAL: Resizing for performance optimization
      wrapper = proc.resizeImageData(wrapper, 600);

      if (canvasRefs.original.current) {
        canvasRefs.original.current.width = wrapper.width;
        canvasRefs.original.current.height = wrapper.height;
        const oCtx = canvasRefs.original.current.getContext('2d');
        if (oCtx) {
          oCtx.putImageData(new ImageData(new Uint8ClampedArray(wrapper.data), wrapper.width, wrapper.height), 0, 0);
        }
      }

      processImages(wrapper);
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
    <div className="animate-fade-in space-y-12 pb-20">
      {/* Header Controls */}
      <div className="glass-card p-6 md:p-10 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500 opacity-5 blur-[100px] -mr-32 -mt-32"></div>
        <div className="flex flex-col items-center gap-6 relative z-10">
          <div className="p-4 rounded-full bg-cyan-500 bg-opacity-10 border border-cyan-500 border-opacity-20 shadow-lg shadow-cyan-500/10">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div>
            <h3 className="text-3xl font-extrabold tracking-tight mb-2">Real-Time CV Experimentation</h3>
            <p className="text-sm opacity-60 max-w-2xl mx-auto">Pipeline: Original → Noise → Filtering (Gaussian & Median) → Edge Detection (Sobel). Hasil akan diperbarui secara instan.</p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-4">
            <label className="cursor-pointer">
              <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
              <span className="button bg-cyan-600 hover:bg-cyan-500 flex items-center gap-2 px-8 py-4 rounded-2xl font-bold transition-all shadow-xl shadow-cyan-900/30">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload Gambar
              </span>
            </label>

            {defaultImageUrls.map((url, i) => (
              <button key={i} className={`bg-white hover:bg-opacity-10 border border-white transition-all px-6 py-4 rounded-2xl font-bold ${selectedImage === url ? 'bg-opacity-20 border-opacity-40' : 'bg-opacity-5 border-opacity-10'}`} onClick={() => setSelectedImage(url)}>
                Contoh {i + 1}
              </button>
            ))}

            <button className="bg-purple-600 hover:bg-purple-500 flex items-center gap-2 px-8 py-4 rounded-2xl font-bold transition-all shadow-xl shadow-purple-900/30" onClick={handleShare}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Lock Demo State
            </button>
          </div>
          
          {showShareToast && (
            <div className="absolute top-4 right-4 bg-green-500 text-white text-xs font-bold px-6 py-3 rounded-full animate-bounce shadow-2xl">
              Link Berhasil Disalin!
            </div>
          )}
        </div>
      </div>

      {/* Main Pipeline Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <Card title="1. Original Image" ref={canvasRefs.original} desc="Citra asli (Baseline)" />
        <Card title={`2. Noisy Citra (${noiseType})`} ref={canvasRefs.noisy} desc={`Artifisial noise ${(noiseDensity*100).toFixed(0)}%`} />
        <Card title="3. Gaussian Filter (Exp A)" ref={canvasRefs.gaussian} desc="Mereduksi noise dengan pembobotan spasial" />
        <Card title="4. Median Filter (Exp B)" ref={canvasRefs.median} desc="Mereduksi noise dengan nilai tengah window" />
        <Card title="5. Sobel Edge (dari Exp A)" ref={canvasRefs.edgeG} desc="Deteksi tepi setelah Filter Gaussian" accent />
        <Card title="6. Sobel Edge (dari Exp B)" ref={canvasRefs.edgeM} desc="Deteksi tepi setelah Filter Median" accent />
      </div>

      {/* Parameters & Analysis */}
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="glass-card p-8 lg:col-span-1 space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1V15a2 2 0 0 1-2-2 2 2 0 0 1 2-2v-.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </div>
            <h3 className="text-xl font-bold">Control Panel</h3>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">Noise Configuration</span>
              <div className="flex gap-2">
                {['salt_pepper', 'gaussian'].map(t => (
                  <button key={t} onClick={() => setNoiseType(t as any)} className={`flex-1 text-xs py-3 rounded-xl border transition-all ${noiseType === t ? 'bg-cyan-600 border-cyan-400 shadow-lg shadow-cyan-900/20' : 'bg-white/5 border-white/10 opacity-50 hover:opacity-100'}`}>
                    {t.replace('_', ' ').toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="pt-2">
                <div className="flex justify-between text-[10px] font-bold mb-2">
                  <span className="opacity-40">INTENSITY</span>
                  <span className="text-cyan-400">{Math.round(noiseDensity * 100)}%</span>
                </div>
                <input type="range" min="0.1" max="0.3" step="0.01" value={noiseDensity} onChange={e => setNoiseDensity(parseFloat(e.target.value))} className="w-full" />
              </div>
            </div>

            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">Gaussian Sigma (Filter A)</span>
              <div className="flex justify-between text-[10px] font-bold mb-2">
                <span className="opacity-40">SIGMA (σ)</span>
                <span className="text-cyan-400">{sigma.toFixed(1)}</span>
              </div>
              <input type="range" min="0.5" max="3" step="0.1" value={sigma} onChange={e => setSigma(parseFloat(e.target.value))} className="w-full" />
            </div>

            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">Median Size (Filter B)</span>
              <div className="flex justify-between text-[10px] font-bold mb-2">
                <span className="opacity-40">KERNEL</span>
                <span className="text-purple-400">{medianSize}x{medianSize}</span>
              </div>
              <input type="range" min="3" max="7" step="2" value={medianSize} onChange={e => setMedianSize(parseInt(e.target.value))} className="w-full" />
            </div>
          </div>
        </div>

        <div className="glass-card p-8 lg:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12H10"/></svg>
            </div>
            <h3 className="text-xl font-bold">Analisis Akademis</h3>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white/5 p-6 rounded-2xl border border-white/5 hover:bg-white/[0.08] transition-all">
              <h4 className="text-sm font-bold text-cyan-400 mb-3">Efektivitas Filter A</h4>
              <p className="text-xs opacity-60 leading-relaxed">
                Filter Gaussian sangat efektif untuk Gaussian noise karena mengikuti distribusi normal. Filter ini menghaluskan citra namun dapat mengaburkan tepi jika sigma terlalu besar.
              </p>
            </div>
            <div className="bg-white/5 p-6 rounded-2xl border border-white/5 hover:bg-white/[0.08] transition-all">
              <h4 className="text-sm font-bold text-purple-400 mb-3">Efektivitas Filter B</h4>
              <p className="text-xs opacity-60 leading-relaxed">
                Filter Median sangat superior untuk Salt & Pepper noise. Karena non-linear, ia mampu membuang outlier tanpa merusak ketajaman tepi citra secara signifikan.
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-cyan-900/20 to-purple-900/20 p-6 rounded-2xl border border-white/10">
            <h4 className="text-sm font-bold mb-3">Impact on Edge Detection (Sobel)</h4>
            <p className="text-xs opacity-70 leading-relaxed">
              Tanpa filtering, Sobel akan mendeteksi noise sebagai garis tepi (False Edges). Perbandingan antara Edge A dan Edge B menunjukkan bahwa pemilihan filter yang tepat sebelum deteksi tepi sangat krusial untuk mendapatkan ekstraksi fitur yang akurat dan bersih dari artefak.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4">
             <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`}></div>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Status: {isProcessing ? 'PROCESSING...' : 'READY'}</span>
             </div>
             <span className="text-[10px] font-bold opacity-30 tracking-widest">REAL-TIME ENGINE v2.5</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const Card = React.forwardRef<HTMLCanvasElement, { title: string; desc?: string; accent?: boolean }>(({ title, desc, accent }, ref) => (
  <div className={`glass-card p-4 flex flex-col gap-4 ${accent ? 'border-purple-500/40' : ''} hover:scale-[1.02] transition-all`}>
    <div className="space-y-1">
      <h4 className="text-center font-black text-xs uppercase tracking-widest text-white/90">{title}</h4>
      {desc && <p className="text-[9px] text-center opacity-40 uppercase tracking-tighter">{desc}</p>}
    </div>
    <div className="canvas-container">
      <canvas ref={ref} />
    </div>
  </div>
));

Card.displayName = 'Card';

export default ImageWorkspace;
