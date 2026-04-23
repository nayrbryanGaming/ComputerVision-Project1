'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as proc from '../lib/processor';

interface ImageWorkspaceProps {
  defaultImageUrls: string[];
}

const ImageWorkspace: React.FC<ImageWorkspaceProps> = ({ defaultImageUrls }) => {
  const [selectedImage, setSelectedImage] = useState<string>(defaultImageUrls[0]);
  const [noiseType, setNoiseType] = useState<'salt_pepper' | 'gaussian'>('salt_pepper');
  const [noiseDensity, setNoiseDensity] = useState(0.15);
  const [sigma, setSigma] = useState(1.2);
  const [medianSize, setMedianSize] = useState(3);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [imageWrapper, setImageWrapper] = useState<proc.ImageDataWrapper | null>(null);

  const canvasRefs = {
    original: useRef<HTMLCanvasElement>(null),
    noisy: useRef<HTMLCanvasElement>(null),
    gaussian: useRef<HTMLCanvasElement>(null),
    median: useRef<HTMLCanvasElement>(null),
    edgeG: useRef<HTMLCanvasElement>(null),
    edgeM: useRef<HTMLCanvasElement>(null),
  };

  // Sync state from URL hash
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.substring(1) : '';
    if (hash) {
      const params = new URLSearchParams(hash);
      const nt = params.get('nt') as any;
      const nd = parseFloat(params.get('nd') || '0.15');
      const sig = parseFloat(params.get('sig') || '1.2');
      const ms = parseInt(params.get('ms') || '3');
      const imgIdx = parseInt(params.get('img') || '0');

      if (nt) setNoiseType(nt);
      if (nd) setNoiseDensity(nd);
      if (sig) setSigma(sig);
      if (ms) setMedianSize(ms);
      if (defaultImageUrls[imgIdx]) setSelectedImage(defaultImageUrls[imgIdx]);
    }
  }, [defaultImageUrls]);

  // Update URL hash
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

  const processImages = useCallback(async (base: proc.ImageDataWrapper) => {
    setIsProcessing(true);
    
    // Use setTimeout to allow UI thread to breathe
    setTimeout(() => {
      // 1. Generate Noise
      let noisy: proc.ImageDataWrapper;
      if (noiseType === 'salt_pepper') {
        noisy = proc.addSaltAndPepperNoise(base, noiseDensity);
      } else {
        noisy = proc.addGaussianNoise(base, noiseDensity * 50);
      }

      // 2. Apply Filters
      const gaussianFiltered = proc.applyGaussianFilter(noisy, sigma);
      const medianFiltered = proc.applyMedianFilter(noisy, medianSize);

      // 3. Edge Detection
      const edgesG = proc.applySobelOperator(gaussianFiltered);
      const edgesM = proc.applySobelOperator(medianFiltered);

      const render = (ref: React.RefObject<HTMLCanvasElement | null>, data: proc.ImageDataWrapper) => {
        if (ref.current) {
          const ctx = ref.current.getContext('2d');
          if (ctx) {
            ref.current.width = data.width;
            ref.current.height = data.height;
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
    }, 50);
  }, [noiseType, noiseDensity, sigma, medianSize]);

  // Load and Resize Image
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

      // PERFORMANCE: Resizing for fluid real-time demo
      wrapper = proc.resizeImageData(wrapper, 500);
      setImageWrapper(wrapper);

      if (canvasRefs.original.current) {
        canvasRefs.original.current.width = wrapper.width;
        canvasRefs.original.current.height = wrapper.height;
        const oCtx = canvasRefs.original.current.getContext('2d');
        if (oCtx) {
          oCtx.putImageData(new ImageData(new Uint8ClampedArray(wrapper.data), wrapper.width, wrapper.height), 0, 0);
        }
      }
    };
  }, [selectedImage]);

  // Trigger processing when parameters change
  useEffect(() => {
    if (imageWrapper) {
      const timeout = setTimeout(() => processImages(imageWrapper), 200);
      return () => clearTimeout(timeout);
    }
  }, [imageWrapper, processImages]);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) setSelectedImage(event.target.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleShare = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 3000);
    }
  };

  return (
    <div className="animate-fade-in space-y-10 pb-20">
      <div className="glass-card p-6 md:p-10 text-center relative overflow-hidden border-b-4 border-cyan-500/30">
        <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500 opacity-5 blur-[120px] -mr-40 -mt-40"></div>
        <div className="flex flex-col items-center gap-6 relative z-10">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 shadow-xl shadow-cyan-500/10">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <h3 className="text-3xl font-black tracking-tight text-white/90">Eksperimen Citra Digital</h3>
          </div>
          
          <div className="flex flex-wrap justify-center gap-4">
            <label className="group relative cursor-pointer">
              <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
              <span className="bg-cyan-600 hover:bg-cyan-500 flex items-center gap-2 px-8 py-4 rounded-2xl font-black transition-all shadow-xl shadow-cyan-900/40 active:scale-95">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                UPLOAD GAMBAR
              </span>
            </label>

            <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/10">
              {defaultImageUrls.map((url, i) => (
                <button key={i} className={`px-6 py-3 rounded-xl font-bold transition-all ${selectedImage === url ? 'bg-white/20 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`} onClick={() => setSelectedImage(url)}>
                  SAMPLE {i + 1}
                </button>
              ))}
            </div>

            <button className="bg-purple-600 hover:bg-purple-500 flex items-center gap-2 px-8 py-4 rounded-2xl font-black transition-all shadow-xl shadow-purple-900/40 active:scale-95" onClick={handleShare}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              LOCK STATE
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <Card title="1. Citra Asli" ref={canvasRefs.original} desc="Original Input" />
        <Card title={`2. Citra + Noise (${noiseType})`} ref={canvasRefs.noisy} desc={`Density: ${(noiseDensity*100).toFixed(0)}%`} />
        <Card title="3. Gaussian Filter (A)" ref={canvasRefs.gaussian} desc={`Sigma (σ): ${sigma.toFixed(1)}`} />
        <Card title="4. Median Filter (B)" ref={canvasRefs.median} desc={`Kernel: ${medianSize}x${medianSize}`} />
        <Card title="5. Sobel Edge (A)" ref={canvasRefs.edgeG} desc="Detected from Gaussian" accent />
        <Card title="6. Sobel Edge (B)" ref={canvasRefs.edgeM} desc="Detected from Median" accent />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="glass-card p-8 lg:col-span-1 space-y-10 border-t-4 border-cyan-500/20">
          <div className="space-y-4">
            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-400">PILIH MODE NOISE</span>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setNoiseType('salt_pepper')} className={`py-4 rounded-xl font-black text-[10px] border transition-all ${noiseType === 'salt_pepper' ? 'bg-cyan-600 border-cyan-400 shadow-xl shadow-cyan-900/40 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:opacity-100'}`}>
                SALT & PEPPER
              </button>
              <button onClick={() => setNoiseType('gaussian')} className={`py-4 rounded-xl font-black text-[10px] border transition-all ${noiseType === 'gaussian' ? 'bg-cyan-600 border-cyan-400 shadow-xl shadow-cyan-900/40 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:opacity-100'}`}>
                GAUSSIAN
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40">Intensitas Noise</span>
                <span className="text-cyan-400 font-black text-xs">{Math.round(noiseDensity * 100)}%</span>
              </div>
              <input type="range" min="0.05" max="0.3" step="0.01" value={noiseDensity} onChange={e => setNoiseDensity(parseFloat(e.target.value))} className="w-full" />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40">Filter A (Sigma)</span>
                <span className="text-cyan-400 font-black text-xs">{sigma.toFixed(1)}</span>
              </div>
              <input type="range" min="0.5" max="3" step="0.1" value={sigma} onChange={e => setSigma(parseFloat(e.target.value))} className="w-full" />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40">Filter B (Kernel)</span>
                <span className="text-purple-400 font-black text-xs">{medianSize}x{medianSize}</span>
              </div>
              <input type="range" min="3" max="7" step="2" value={medianSize} onChange={e => setMedianSize(parseInt(e.target.value))} className="w-full" />
            </div>
          </div>
        </div>

        <div className="glass-card p-8 lg:col-span-2 space-y-6 border-t-4 border-purple-500/20">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-2xl font-black text-white/90">Analisis Eksperimental</h3>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
              <h4 className="text-[10px] font-black text-cyan-400 mb-4 tracking-widest uppercase">Karakteristik Filter A</h4>
              <p className="text-xs opacity-60 leading-loose">
                Gaussian Filter sangat optimal untuk mereduksi noise terdistribusi normal. Namun, pada noise impulsif (Salt & Pepper), filter ini cenderung menyebarkan noise (smearing) daripada menghilangkannya.
              </p>
            </div>
            <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
              <h4 className="text-[10px] font-black text-purple-400 mb-4 tracking-widest uppercase">Karakteristik Filter B</h4>
              <p className="text-xs opacity-60 leading-loose">
                Median Filter unggul dalam mempertahankan ketajaman tepi citra (Edge Preserving) sambil membuang noise outlier secara total. Sangat direkomendasikan untuk restorasi citra satelit/medis.
              </p>
            </div>
          </div>

          <div className="bg-white/5 p-6 rounded-2xl border-l-4 border-cyan-500">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-yellow-400 animate-pulse shadow-lg shadow-yellow-500/50' : 'bg-green-400 shadow-lg shadow-green-500/50'}`}></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Engine Status: {isProcessing ? 'PROCESSING PIPELINE' : 'SYSTEM IDLE'}</span>
                </div>
                <span className="text-[10px] font-black opacity-20 tracking-[0.4em]">OPTIMIZED v3.0</span>
             </div>
          </div>
        </div>
      </div>

      {showShareToast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-white text-black px-8 py-4 rounded-2xl font-black shadow-2xl z-50 animate-bounce">
          LINK COPIED TO CLIPBOARD
        </div>
      )}
    </div>
  );
};

const Card = React.forwardRef<HTMLCanvasElement, { title: string; desc?: string; accent?: boolean }>(({ title, desc, accent }, ref) => (
  <div className={`glass-card p-5 flex flex-col gap-4 ${accent ? 'border-purple-500/40 bg-purple-500/5' : 'bg-white/[0.02]'} hover:bg-white/[0.05] transition-all duration-500`}>
    <div className="flex justify-between items-center border-b border-white/5 pb-3">
      <h4 className="font-black text-[10px] uppercase tracking-[0.2em] text-white/80">{title}</h4>
      <span className="text-[9px] font-bold opacity-30 uppercase">{desc}</span>
    </div>
    <div className="canvas-container">
      <canvas ref={ref} className="w-full h-auto object-contain" />
    </div>
  </div>
));

Card.displayName = 'Card';

export default ImageWorkspace;
