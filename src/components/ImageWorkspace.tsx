'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as proc from '../lib/processor';

interface ImageWorkspaceProps {
  defaultImageUrls: string[];
}

const ImageWorkspace: React.FC<ImageWorkspaceProps> = ({ defaultImageUrls }) => {
  // --- STATE ---
  const [selectedImage, setSelectedImage] = useState<string>(defaultImageUrls[0]);
  const [noiseType, setNoiseType] = useState<'salt_pepper' | 'gaussian'>('salt_pepper');
  const [noiseDensity, setNoiseDensity] = useState(0.15);
  const [sigma, setSigma] = useState(1.2);
  const [medianSize, setMedianSize] = useState(3);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [imageWrapper, setImageWrapper] = useState<proc.ImageDataWrapper | null>(null);

  // --- REFS ---
  const canvasRefs = {
    original: useRef<HTMLCanvasElement>(null),
    noisy: useRef<HTMLCanvasElement>(null),
    gaussian: useRef<HTMLCanvasElement>(null),
    median: useRef<HTMLCanvasElement>(null),
    edgeG: useRef<HTMLCanvasElement>(null),
    edgeM: useRef<HTMLCanvasElement>(null),
  };

  // --- HASH SYNC ---
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

  // --- CORE CV PIPELINE ---
  const processImages = useCallback(async (base: proc.ImageDataWrapper) => {
    setIsProcessing(true);
    
    // Defer to prevent UI blocking
    setTimeout(() => {
      // STEP 2: Generate Noise
      let noisy: proc.ImageDataWrapper;
      if (noiseType === 'salt_pepper') {
        noisy = proc.addSaltAndPepperNoise(base, noiseDensity);
      } else {
        noisy = proc.addGaussianNoise(base, noiseDensity * 50);
      }

      // STEP 3: Filtering (Exp A & B)
      const gaussianFiltered = proc.applyGaussianFilter(noisy, sigma);
      const medianFiltered = proc.applyMedianFilter(noisy, medianSize);

      // STEP 4: Edge Detection (Sobel A & B)
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
    }, 10);
  }, [noiseType, noiseDensity, sigma, medianSize]);

  // --- IMAGE LOADING ---
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

      // PERFORMANCE: Downscale to ensure "Real-Time" feels fast
      wrapper = proc.resizeImageData(wrapper, 450);
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

  useEffect(() => {
    if (imageWrapper) {
      const timeout = setTimeout(() => processImages(imageWrapper), 150);
      return () => clearTimeout(timeout);
    }
  }, [imageWrapper, processImages]);

  // --- HANDLERS ---
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
    <div className="animate-fade-in space-y-12 pb-20 px-4 max-w-[1600px] mx-auto">
      {/* HEADER SECTION */}
      <div className="glass-card p-6 md:p-12 text-center relative overflow-hidden border-b-4 border-cyan-500/40">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500 opacity-10 blur-[150px] -mr-48 -mt-48"></div>
        
        <div className="flex flex-col items-center gap-8 relative z-10">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40">
              ANALISIS HUBUNGAN NOISE & FILTER
            </h1>
            <p className="text-sm font-bold opacity-40 uppercase tracking-[0.5em]">Tugas 1: Pengolahan Citra Digital - Kelompok 5</p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-6">
            {/* UPLOAD BUTTON */}
            <label className="group relative cursor-pointer">
              <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
              <div className="bg-cyan-600 hover:bg-cyan-500 flex items-center gap-3 px-10 py-5 rounded-2xl font-black transition-all shadow-[0_0_40px_rgba(8,145,178,0.3)] active:scale-95 group-hover:shadow-[0_0_60px_rgba(8,145,178,0.5)]">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                UPLOAD GAMBAR MANUAL
              </div>
            </label>

            {/* DEFAULT SAMPLES */}
            <div className="flex gap-2 p-2 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-xl">
              {defaultImageUrls.map((url, i) => (
                <button 
                  key={i} 
                  className={`px-8 py-4 rounded-2xl font-black text-xs transition-all ${selectedImage === url ? 'bg-white text-black shadow-2xl scale-105' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                  onClick={() => setSelectedImage(url)}
                >
                  CONTOH {i + 1}
                </button>
              ))}
            </div>

            {/* SHARE/LOCK BUTTON */}
            <button 
              className="bg-purple-600 hover:bg-purple-500 flex items-center gap-3 px-10 py-5 rounded-2xl font-black transition-all shadow-[0_0_40px_rgba(147,51,234,0.3)] active:scale-95"
              onClick={handleShare}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              LOCK & SHARE
            </button>
          </div>
        </div>
      </div>

      {/* PIPELINE GRID - MUST SHOW 6 CARDS AS PER WAJIB */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <Card title="1. Gambar Asli" ref={canvasRefs.original} desc="Input citra tanpa gangguan" />
        <Card title={`2. Gambar + Noise (${noiseType})`} ref={canvasRefs.noisy} desc={`Gangguan artifisial ${(noiseDensity*100).toFixed(0)}%`} />
        <Card title="3. Hasil Filter A (Gaussian)" ref={canvasRefs.gaussian} desc={`Mereduksi noise dengan σ: ${sigma.toFixed(1)}`} />
        <Card title="4. Hasil Filter B (Median)" ref={canvasRefs.median} desc={`Mereduksi noise dengan kernel: ${medianSize}x${medianSize}`} />
        <Card title="5. Hasil Edge A (Sobel)" ref={canvasRefs.edgeG} desc="Deteksi tepi dari Filter Gaussian" accent />
        <Card title="6. Hasil Edge B (Sobel)" ref={canvasRefs.edgeM} desc="Deteksi tepi dari Filter Median" accent />
      </div>

      {/* CONTROLS & ANALYSIS */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* PARAMETERS */}
        <div className="glass-card p-8 lg:col-span-1 space-y-12 border-t-4 border-cyan-500/30">
          <div className="space-y-6">
            <h4 className="text-xs font-black uppercase tracking-[0.4em] text-cyan-400">Konfigurasi Eksperimen</h4>
            
            <div className="space-y-4">
              <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Pilih Jenis Noise</span>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setNoiseType('salt_pepper')} 
                  className={`py-4 rounded-2xl font-black text-[10px] border transition-all ${noiseType === 'salt_pepper' ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'}`}
                >
                  SALT & PEPPER
                </button>
                <button 
                  onClick={() => setNoiseType('gaussian')} 
                  className={`py-4 rounded-2xl font-black text-[10px] border transition-all ${noiseType === 'gaussian' ? 'bg-cyan-600 border-cyan-400 text-white shadow-lg' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'}`}
                >
                  GAUSSIAN
                </button>
              </div>
            </div>

            <div className="space-y-6 pt-4">
              <ControlSlider label="Intensitas Noise" value={Math.round(noiseDensity * 100) + "%"} min={0.05} max={0.3} step={0.01} current={noiseDensity} onChange={(v: number) => setNoiseDensity(v)} color="cyan" />
              <ControlSlider label="Gaussian Sigma (Filter A)" value={sigma.toFixed(1)} min={0.5} max={0.3} step={0.1} current={sigma} onChange={(v: number) => setSigma(v)} color="cyan" />
              <ControlSlider label="Median Kernel (Filter B)" value={medianSize + "x" + medianSize} min={3} max={7} step={2} current={medianSize} onChange={(v: number) => setMedianSize(v)} color="purple" />
            </div>
          </div>
        </div>

        {/* ANALYSIS */}
        <div className="glass-card p-10 lg:col-span-2 space-y-8 border-t-4 border-purple-500/30">
          <div className="flex items-center justify-between border-b border-white/10 pb-6">
            <h3 className="text-3xl font-black tracking-tighter">Analisis Hubungan</h3>
            <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${isProcessing ? 'bg-yellow-500 text-black animate-pulse' : 'bg-green-500 text-white'}`}>
              {isProcessing ? 'Processing Pipeline...' : 'System Ready'}
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            <AnalysisBlock title="Filter A: Gaussian" color="cyan">
              Sangat efektif untuk mereduksi noise yang terdistribusi normal (Gaussian). Namun, ia cenderung mengaburkan (blur) tepi objek karena sifat konvolusi linier. Kurang efektif pada Salt & Pepper.
            </AnalysisBlock>
            <AnalysisBlock title="Filter B: Median" color="purple">
              Unggul mutlak dalam menangani Salt & Pepper noise. Sebagai filter non-linier, ia mampu mempertahankan ketajaman tepi (edge preservation) jauh lebih baik daripada Gaussian filter.
            </AnalysisBlock>
          </div>

          <div className="bg-white/5 p-8 rounded-3xl border border-white/10 space-y-4">
            <h5 className="font-black text-sm uppercase tracking-widest text-white/90">Insight Deteksi Tepi (Sobel)</h5>
            <p className="text-sm opacity-50 leading-relaxed">
              Hasil **Sobel A vs Sobel B** membuktikan bahwa pemilihan filter sangat krusial. Noise yang tersisa akan dideteksi sebagai "tepi palsu" (artefak), sementara filter yang terlalu kuat akan menghilangkan detail tepi asli. Melalui demo ini, terlihat bahwa **Median Filter** memberikan input yang lebih bersih untuk Sobel pada noise Salt & Pepper.
            </p>
          </div>

          <div className="flex items-center justify-between text-[10px] font-bold opacity-20 tracking-[0.5em] uppercase pt-4">
            <span>Manual CV Engine v3.2</span>
            <span>Optimized for Landscape & Portrait</span>
          </div>
        </div>
      </div>

      {showShareToast && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-white text-black px-10 py-5 rounded-3xl font-black shadow-[0_20px_80px_rgba(255,255,255,0.2)] z-50 animate-bounce">
          LINK EKSPERIMEN DISALIN!
        </div>
      )}
    </div>
  );
};

// --- SUB-COMPONENTS ---

const Card = React.forwardRef<HTMLCanvasElement, { title: string; desc?: string; accent?: boolean }>(({ title, desc, accent }, ref) => (
  <div className={`glass-card p-6 flex flex-col gap-6 group hover:bg-white/[0.04] transition-all duration-700 ${accent ? 'border-purple-500/20' : 'border-white/5'}`}>
    <div className="flex flex-col gap-1 border-b border-white/5 pb-4">
      <h4 className="font-black text-[11px] uppercase tracking-[0.25em] text-white/90 group-hover:text-cyan-400 transition-colors">{title}</h4>
      {desc && <span className="text-[9px] font-bold opacity-30 uppercase tracking-tighter">{desc}</span>}
    </div>
    <div className="canvas-container bg-black/40 shadow-inner">
      <canvas ref={ref} className="w-full h-auto object-contain max-h-[400px]" />
    </div>
  </div>
));
Card.displayName = 'Card';

const ControlSlider = ({ label, value, min, max, step, current, onChange, color }: any) => (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">{label}</span>
      <span className={`text-${color}-400 font-black text-xs bg-${color}-500/10 px-3 py-1 rounded-lg`}>{value}</span>
    </div>
    <input 
      type="range" min={min} max={max} step={step} value={current} 
      onChange={e => onChange(parseFloat(e.target.value))} 
      className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
    />
  </div>
);

const AnalysisBlock = ({ title, children, color }: any) => (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <div className={`w-2 h-2 rounded-full bg-${color}-500 shadow-[0_0_10px_rgba(255,255,255,0.5)]`}></div>
      <h5 className={`font-black text-xs uppercase tracking-widest text-${color}-400`}>{title}</h5>
    </div>
    <p className="text-xs opacity-60 leading-loose">{children}</p>
  </div>
);

export default ImageWorkspace;
