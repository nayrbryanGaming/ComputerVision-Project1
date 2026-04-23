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

  // --- State Sync (URL Hash) ---
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

  // --- Processing ---
  const processImages = useCallback(async (base: proc.ImageDataWrapper) => {
    setIsProcessing(true);
    setTimeout(() => {
      let noisy: proc.ImageDataWrapper;
      if (noiseType === 'salt_pepper') {
        noisy = proc.addSaltAndPepperNoise(base, noiseDensity);
      } else {
        noisy = proc.addGaussianNoise(base, noiseDensity * 50);
      }

      const gaussianFiltered = proc.applyGaussianFilter(noisy, sigma);
      const medianFiltered = proc.applyMedianFilter(noisy, medianSize);
      const edgesG = proc.applySobelOperator(gaussianFiltered);
      const edgesM = proc.applySobelOperator(medianFiltered);

      const render = (ref: React.RefObject<HTMLCanvasElement | null>, data: proc.ImageDataWrapper) => {
        if (ref.current) {
          const ctx = ref.current.getContext('2d');
          if (ctx) {
            ref.current.width = data.width;
            ref.current.height = data.height;
            ctx.putImageData(new ImageData(new Uint8ClampedArray(data.data), data.width, data.height), 0, 0);
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

  // --- Loading ---
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

      wrapper = proc.resizeImageData(wrapper, 400); 
      setImageWrapper(wrapper);

      if (canvasRefs.original.current) {
        canvasRefs.original.current.width = wrapper.width;
        canvasRefs.original.current.height = wrapper.height;
        canvasRefs.original.current.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(wrapper.data), wrapper.width, wrapper.height), 0, 0);
      }
    };
  }, [selectedImage]);

  useEffect(() => {
    if (imageWrapper) {
      const timeout = setTimeout(() => processImages(imageWrapper), 100);
      return () => clearTimeout(timeout);
    }
  }, [imageWrapper, processImages]);

  return (
    <div className="flex flex-col lg:flex-row gap-8 pb-10">
      {/* 🛠️ COMPACT SIDEBAR CONTROLS */}
      <div className="lg:w-[320px] lg:sticky lg:top-8 h-fit space-y-6">
        <div className="glass-card p-6 border-b-2 border-cyan-500/30">
          <h2 className="text-xl font-black tracking-tight mb-6">CONTROL PANEL</h2>
          
          <div className="space-y-8">
            {/* Image Source */}
            <div className="space-y-3">
              <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Image Source</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setSelectedImage(defaultImageUrls[0])} className={`py-3 rounded-lg text-[10px] font-black border transition-all ${selectedImage === defaultImageUrls[0] ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/40'}`}>SAMPLE 1</button>
                <button onClick={() => setSelectedImage(defaultImageUrls[1])} className={`py-3 rounded-lg text-[10px] font-black border transition-all ${selectedImage === defaultImageUrls[1] ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/40'}`}>SAMPLE 2</button>
              </div>
              <label className="block w-full">
                <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => setSelectedImage(ev.target?.result as string);
                    reader.readAsDataURL(file);
                  }
                }} />
                <div className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-center rounded-lg font-black text-[10px] cursor-pointer transition-all">UPLOAD MANUAL</div>
              </label>
            </div>

            {/* Noise Config */}
            <div className="space-y-4">
              <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Noise Model</p>
              <div className="flex gap-2">
                <button onClick={() => setNoiseType('salt_pepper')} className={`flex-1 py-3 rounded-lg text-[9px] font-black border transition-all ${noiseType === 'salt_pepper' ? 'bg-cyan-500 border-cyan-400 text-white' : 'bg-white/5 border-white/10 text-white/40'}`}>SALT & PEPPER</button>
                <button onClick={() => setNoiseType('gaussian')} className={`flex-1 py-3 rounded-lg text-[9px] font-black border transition-all ${noiseType === 'gaussian' ? 'bg-cyan-500 border-cyan-400 text-white' : 'bg-white/5 border-white/10 text-white/40'}`}>GAUSSIAN</button>
              </div>
              <ParamSlider label="Noise Intensity" value={Math.round(noiseDensity * 100) + "%"} min={0.05} max={0.4} step={0.01} current={noiseDensity} onChange={setNoiseDensity} />
            </div>

            {/* Filter Config */}
            <div className="space-y-4 pt-4 border-t border-white/5">
              <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">Filter Params</p>
              <ParamSlider label="Sigma (Gaussian)" value={sigma.toFixed(1)} min={0.5} max={3.0} step={0.1} current={sigma} onChange={setSigma} />
              <ParamSlider label="Kernel (Median)" value={medianSize + "x" + medianSize} min={3} max={9} step={2} current={medianSize} onChange={setMedianSize} />
            </div>

            <button onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              setShowShareToast(true);
              setTimeout(() => setShowShareToast(false), 2000);
            }} className="w-full py-4 bg-purple-600 hover:bg-purple-500 rounded-xl font-black text-[10px] shadow-lg shadow-purple-900/40 transition-all">
              LOCK & COPY STATE
            </button>
          </div>
        </div>

        <div className="glass-card p-6 border-l-4 border-cyan-500">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isProcessing ? 'bg-yellow-400 animate-pulse shadow-lg shadow-yellow-500' : 'bg-green-400 shadow-lg shadow-green-500'}`}></div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/60">
              {isProcessing ? 'PROSESING PIPELINE...' : 'ENGINE READY'}
            </p>
          </div>
        </div>
      </div>

      {/* 🖼️ RESULTS GRID (2 COLUMNS) */}
      <div className="flex-1 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ResultCard title="1. ORIGINAL IMAGE" badge="BASELINE" ref={canvasRefs.original} />
          <ResultCard title={`2. DEGRADED (+${noiseType})`} badge="NOISY" ref={canvasRefs.noisy} />
          <ResultCard title="3. FILTER A (GAUSSIAN)" badge="EXP-A" ref={canvasRefs.gaussian} />
          <ResultCard title="4. FILTER B (MEDIAN)" badge="EXP-B" ref={canvasRefs.median} />
          <ResultCard title="5. SOBEL A (FROM GAUSSIAN)" badge="EDGE-A" ref={canvasRefs.edgeG} accent />
          <ResultCard title="6. SOBEL B (FROM MEDIAN)" badge="EDGE-B" ref={canvasRefs.edgeM} accent />
        </div>

        <div className="glass-card p-8 border-t-2 border-white/5 space-y-6">
          <h3 className="text-lg font-black tracking-widest text-cyan-400 uppercase">Analisis Akademis (Kelompok 5)</h3>
          <p className="text-xs opacity-50 leading-loose">
            Berdasarkan eksperimen di atas, terlihat jelas perbedaan performa antara <strong>Gaussian Filter</strong> dan <strong>Median Filter</strong>. 
            Pada noise jenis impulsive (Salt & Pepper), filter median secara signifikan mengungguli gaussian karena kemampuannya membuang outlier pixel tanpa mengaburkan tepi. 
            Hal ini berdampak langsung pada akurasi <strong>Sobel Operator</strong>, di mana deteksi tepi pada hasil median jauh lebih bersih dari artefak noise.
          </p>
        </div>
      </div>

      {showShareToast && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-white text-black px-8 py-4 rounded-full font-black shadow-2xl z-50 text-[10px] animate-bounce">
          STATE LINK COPIED!
        </div>
      )}
    </div>
  );
};

const ResultCard = React.forwardRef<HTMLCanvasElement, { title: string; badge: string; accent?: boolean }>(({ title, badge, accent }, ref) => (
  <div className={`glass-card p-5 space-y-4 border transition-all ${accent ? 'border-purple-500/20 bg-purple-500/5' : 'border-white/5'}`}>
    <div className="flex justify-between items-center border-b border-white/5 pb-3">
      <h4 className="text-[9px] font-black tracking-widest text-white/70">{title}</h4>
      <span className="text-[7px] font-black bg-white/10 px-2 py-0.5 rounded-full opacity-40">{badge}</span>
    </div>
    <div className="canvas-container bg-black/80 flex items-center justify-center overflow-hidden rounded-lg border border-white/5" style={{ height: '240px' }}>
      <canvas ref={ref} className="max-w-full max-h-full object-contain" />
    </div>
  </div>
));
ResultCard.displayName = 'ResultCard';

const ParamSlider = ({ label, value, min, max, step, current, onChange }: any) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center">
      <span className="text-[9px] font-black opacity-30 uppercase tracking-tighter">{label}</span>
      <span className="text-cyan-400 font-black text-[9px]">{value}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={current} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full" />
  </div>
);

export default ImageWorkspace;
