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

  // --- HASH SYNC (LOCK STATE) ---
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
      // 1. Generate Noise (Gaussian vs Salt & Pepper)
      let noisy: proc.ImageDataWrapper;
      if (noiseType === 'salt_pepper') {
        noisy = proc.addSaltAndPepperNoise(base, noiseDensity);
      } else {
        noisy = proc.addGaussianNoise(base, noiseDensity * 50);
      }

      // 2. Apply Filters (Exp A: Gaussian, Exp B: Median)
      const gaussianFiltered = proc.applyGaussianFilter(noisy, sigma);
      const medianFiltered = proc.applyMedianFilter(noisy, medianSize);

      // 3. Edge Detection (Sobel)
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

  // --- IMAGE LOADING & DYNAMIC RESIZING ---
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

      // PERFORMANCE: Downscale for Instant Real-Time Preview
      wrapper = proc.resizeImageData(wrapper, 400); 
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
      const timeout = setTimeout(() => processImages(imageWrapper), 100);
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
    <div className="animate-fade-in space-y-12 pb-32">
      {/* 🚀 CONTROL PANEL */}
      <div className="glass-card p-8 md:p-12 border-b-4 border-cyan-500/50 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/10 blur-[100px]"></div>
        
        <div className="grid lg:grid-cols-2 gap-12 items-center relative z-10">
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-cyan-500/20 rounded-2xl border border-cyan-500/30">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <h2 className="text-4xl font-black tracking-tighter">WORKSPACE UTAMA</h2>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="group">
                <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
                <div className="bg-white text-black px-8 py-4 rounded-xl font-black text-xs cursor-pointer hover:bg-cyan-400 transition-all active:scale-95 shadow-xl">
                  UPLOAD GAMBAR BARU
                </div>
              </label>
              <div className="flex gap-2 p-1.5 bg-white/5 rounded-xl border border-white/10">
                {defaultImageUrls.map((url, i) => (
                  <button 
                    key={i} 
                    onClick={() => setSelectedImage(url)}
                    className={`px-6 py-3 rounded-lg text-[10px] font-black transition-all ${selectedImage === url ? 'bg-cyan-600 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                  >
                    CONTOH {i + 1}
                  </button>
                ))}
              </div>
              <button onClick={handleShare} className="bg-purple-600 px-8 py-4 rounded-xl font-black text-xs hover:bg-purple-500 transition-all active:scale-95 shadow-xl">
                LOCK & SHARE STATE
              </button>
            </div>
          </div>

          <div className="glass-card p-8 bg-white/5 space-y-8 border-cyan-500/20">
             <div className="space-y-4">
                <p className="text-[10px] font-black text-cyan-400 tracking-[0.4em] uppercase">1. Pilih Jenis Noise</p>
                <div className="grid grid-cols-2 gap-3">
                   <button onClick={() => setNoiseType('salt_pepper')} className={`py-4 rounded-xl font-black text-[10px] border transition-all ${noiseType === 'salt_pepper' ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-white/5 border-white/10 text-white/30'}`}>SALT & PEPPER</button>
                   <button onClick={() => setNoiseType('gaussian')} className={`py-4 rounded-xl font-black text-[10px] border transition-all ${noiseType === 'gaussian' ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-white/5 border-white/10 text-white/30'}`}>GAUSSIAN NOISE</button>
                </div>
             </div>

             <div className="grid md:grid-cols-3 gap-8">
                <ParamSlider label="Intensity" value={Math.round(noiseDensity * 100) + "%"} min={0.05} max={0.4} step={0.01} current={noiseDensity} onChange={(v) => setNoiseDensity(v)} />
                <ParamSlider label="Sigma (A)" value={sigma.toFixed(1)} min={0.5} max={3.0} step={0.1} current={sigma} onChange={(v) => setSigma(v)} />
                <ParamSlider label="Kernel (B)" value={medianSize + "x" + medianSize} min={3} max={9} step={2} current={medianSize} onChange={(v) => setMedianSize(v)} />
             </div>
          </div>
        </div>
      </div>

      {/* 🖼️ PIPELINE 6-TAHAP (WAJIB) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-4">
        <CanvasCard title="1. Gambar Asli" ref={canvasRefs.original} badge="Input" />
        <CanvasCard title={`2. Gambar + Noise (${noiseType})`} ref={canvasRefs.noisy} badge="Degraded" />
        <CanvasCard title="3. Filter A (Gaussian)" ref={canvasRefs.gaussian} badge="Restoration A" />
        <CanvasCard title="4. Filter B (Median)" ref={canvasRefs.median} badge="Restoration B" />
        <CanvasCard title="5. Edge Detection (Sobel A)" ref={canvasRefs.edgeG} badge="Analysis A" accent />
        <CanvasCard title="6. Edge Detection (Sobel B)" ref={canvasRefs.edgeM} badge="Analysis B" accent />
      </div>

      {/* 📝 ANALISIS AKADEMIS */}
      <div className="px-4">
        <div className="glass-card p-10 border-t-4 border-purple-500/50">
           <h3 className="text-2xl font-black mb-8">HUBUNGAN PROSES & ANALISIS</h3>
           <div className="grid md:grid-cols-2 gap-12">
              <div className="space-y-4">
                 <h4 className="font-black text-cyan-400 text-sm uppercase">Efektivitas Filter A vs B</h4>
                 <p className="text-sm opacity-60 leading-relaxed">
                    Filter Gaussian bekerja secara linier untuk mereduksi noise merata (Gaussian), namun memberikan efek "blurring" pada tepi. 
                    Filter Median bekerja non-linier dengan mengambil nilai tengah, sangat superior untuk menghilangkan Salt & Pepper tanpa mengorbankan ketajaman tepi secara drastis.
                 </p>
              </div>
              <div className="space-y-4">
                 <h4 className="font-black text-purple-400 text-sm uppercase">Dampak pada Edge Detection</h4>
                 <p className="text-sm opacity-60 leading-relaxed">
                    Kinerja **Sobel Operator** sangat bergantung pada kebersihan citra. Noise yang tidak tersaring sempurna akan dideteksi sebagai "false edges" (gradien tajam palsu), 
                    sehingga integritas kontur objek menjadi kacau. Filtering adalah tahap krusial sebelum ekstraksi fitur dilakukan.
                 </p>
              </div>
           </div>
        </div>
      </div>

      {/* 🍞 NOTIFICATION */}
      {showShareToast && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-white text-black px-12 py-5 rounded-2xl font-black shadow-2xl z-50 animate-bounce text-xs tracking-widest">
          STATE LOCKED & COPIED TO CLIPBOARD
        </div>
      )}
    </div>
  );
};

// --- COMPONENTS ---

const CanvasCard = React.forwardRef<HTMLCanvasElement, { title: string; badge: string; accent?: boolean }>(({ title, badge, accent }, ref) => (
  <div className={`glass-card p-6 space-y-6 group transition-all hover:scale-[1.02] ${accent ? 'border-purple-500/30 bg-purple-500/5' : ''}`}>
    <div className="flex justify-between items-center border-b border-white/10 pb-4">
      <h4 className="font-black text-[10px] uppercase tracking-widest text-white/90">{title}</h4>
      <span className="text-[8px] px-3 py-1 bg-white/5 rounded-full font-black opacity-40 uppercase tracking-tighter">{badge}</span>
    </div>
    <div className="canvas-container bg-black/50">
      <canvas ref={ref} className="w-full h-auto block object-contain" />
    </div>
  </div>
));
CanvasCard.displayName = 'CanvasCard';

const ParamSlider = ({ label, value, min, max, step, current, onChange }: any) => (
  <div className="space-y-3">
    <div className="flex justify-between items-center">
      <span className="text-[9px] font-black opacity-30 uppercase tracking-widest">{label}</span>
      <span className="text-cyan-400 font-black text-[10px]">{value}</span>
    </div>
    <input 
      type="range" min={min} max={max} step={step} value={current} 
      onChange={e => onChange(parseFloat(e.target.value))} 
      className="w-full"
    />
  </div>
);

export default ImageWorkspace;
