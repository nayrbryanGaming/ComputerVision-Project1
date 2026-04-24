'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  Cpu, 
  Settings2, 
  Image as ImageIcon, 
  Zap, 
  Info, 
  Layers, 
  Eye, 
  Download,
  Share2,
  AlertCircle,
  Activity,
  Maximize2
} from 'lucide-react';
import { processImagePython, ImageState } from '@/utils/cv-utils';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEFAULT_IMAGE_PATH = '/default.png';
const SAMPLE_2_PATH = '/sample2.png';

export default function CVProject() {
  const [images, setImages] = useState<ImageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [noiseType, setNoiseType] = useState<'gaussian' | 'salt_and_pepper'>('gaussian');
  const [intensity, setIntensity] = useState(0.2);
  const [sigma, setSigma] = useState(2.0);
  const [kernelSize, setKernelSize] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'noise' | 'filter' | 'edges'>('all');
  const [currentImg, setCurrentImg] = useState<File | string>(DEFAULT_IMAGE_PATH);
  const [logs, setLogs] = useState<string[]>(["System initialized.", "Ready for processing."]);
  const [performance, setPerformance] = useState<any>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 5));
  };

  const handleProcess = useCallback(async (source: File | string, nt = noiseType, ni = intensity, s = sigma, ks = kernelSize) => {
    setLoading(true);
    setError(null);
    addLog(`Processing pipeline started...`);
    
    try {
      const result = await processImagePython(source, nt, ni, s, ks);
      setImages(result);
      setCurrentImg(source);
      if (result.timings) {
        setPerformance(result.timings);
        addLog(`Pipeline complete (${result.total_ms}ms)`);
      } else {
        addLog(`Pipeline complete.`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Engine error. Pastikan backend Python aktif.');
      addLog(`Error: ${err.message || 'Internal logic error'}`);
    } finally {
      setLoading(false);
    }
  }, [noiseType, intensity, sigma, kernelSize]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const params = new URLSearchParams(hash);
      const nt = params.get('nt');
      const ni = params.get('ni');
      const sig = params.get('sig');
      const ks = params.get('ks');
      const img = params.get('img');

      if (nt) setNoiseType(nt as any);
      if (ni) setIntensity(parseFloat(ni));
      if (sig) setSigma(parseFloat(sig));
      if (ks) setKernelSize(parseInt(ks));
      
      const path = img === 'sample2' ? SAMPLE_2_PATH : DEFAULT_IMAGE_PATH;
      handleProcess(path, nt as any, parseFloat(ni || '0.2'), parseFloat(sig || '2.0'), parseInt(ks || '5'));
    } else {
      handleProcess(DEFAULT_IMAGE_PATH);
    }
  }, []);

  const onFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File terlalu besar (Maks 5MB).');
        return;
      }
      handleProcess(file);
    }
  };

  const lockState = () => {
    const imgParam = currentImg === SAMPLE_2_PATH ? 'sample2' : 'sample1';
    const hash = `nt=${noiseType}&ni=${intensity}&sig=${sigma}&ks=${kernelSize}&img=${imgParam}`;
    window.location.hash = hash;
    navigator.clipboard.writeText(window.location.href);
    addLog("State locked and copied to clipboard.");
  };

  return (
    <div className="min-h-screen bg-[#020202] text-white font-sans selection:bg-accent-cyan/30 bg-grid">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-accent-cyan/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-accent-purple/10 rounded-full blur-[120px] animate-pulse delay-1000" />
      </div>

      <main className="relative z-10 max-w-[1700px] mx-auto px-4 md:px-10 py-10">
        
        {/* Header Section */}
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 mb-12">
          <div className="space-y-3">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-accent-cyan to-accent-purple shadow-lg shadow-accent-cyan/20">
                <Cpu className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] font-black tracking-[0.4em] text-accent-cyan uppercase">
                CV Core v2.0 • Kelompok 5
              </span>
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-6xl font-black tracking-tighter leading-none"
            >
              VISION <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-cyan via-white to-accent-purple">ANALYTICS</span>
            </motion.h1>
            <p className="text-white/40 max-w-2xl text-sm font-medium">
              Eksperimen filtering dan deteksi tepi menggunakan implementasi algoritma manual Pure Python.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="glass-card px-6 py-3 rounded-2xl flex items-center gap-4">
              <div className="text-right">
                <div className="text-[9px] font-black text-white/30 uppercase tracking-widest">Engine Status</div>
                <div className="flex items-center justify-end gap-2 text-xs font-bold uppercase tracking-tighter">
                  <span className={cn("w-2 h-2 rounded-full animate-pulse", loading ? "bg-amber-500" : "bg-accent-cyan")} />
                  {loading ? 'Processing...' : 'Ready'}
                </div>
              </div>
              <div className="w-[1px] h-8 bg-white/10" />
              <Activity className="w-5 h-5 text-accent-cyan opacity-50" />
            </div>
          </div>
        </header>

        {/* Main Interface */}
        <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-8">
          
          {/* Controls Sidebar */}
          <aside className="space-y-6">
            <div className="glass-card p-8 rounded-[32px] space-y-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent-cyan/5 blur-3xl -mr-16 -mt-16" />
              
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black tracking-widest uppercase italic flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-accent-cyan" />
                  Control Deck
                </h2>
                <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/40">
                  Manual Logic
                </div>
              </div>

              {/* Source Selection */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] block">Image Input</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => handleProcess(DEFAULT_IMAGE_PATH)} 
                    className={cn(
                      "h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      currentImg === DEFAULT_IMAGE_PATH ? "bg-white text-black" : "bg-white/5 hover:bg-white/10 border border-white/5"
                    )}
                  >
                    Sample A
                  </button>
                  <button 
                    onClick={() => handleProcess(SAMPLE_2_PATH)} 
                    className={cn(
                      "h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      currentImg === SAMPLE_2_PATH ? "bg-white text-black" : "bg-white/5 hover:bg-white/10 border border-white/5"
                    )}
                  >
                    Sample B
                  </button>
                </div>
                <div className="relative group">
                  <input type="file" id="cv-upload" className="hidden" onChange={onFileUpload} accept="image/*" />
                  <label 
                    htmlFor="cv-upload" 
                    className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-accent-cyan text-black font-black uppercase text-[10px] tracking-widest cursor-pointer hover:brightness-110 active:scale-95 transition-all"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Custom
                  </label>
                </div>
              </div>

              {/* Noise Parameters */}
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Noise Model</label>
                  <span className="text-[10px] font-bold text-accent-cyan italic">{(intensity * 100).toFixed(0)}% Intensity</span>
                </div>
                <div className="p-1 rounded-xl bg-black/40 border border-white/5 flex gap-1">
                  {(['gaussian', 'salt_and_pepper'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setNoiseType(type)}
                      className={cn(
                        "flex-1 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                        noiseType === type ? "bg-white text-black" : "text-white/40 hover:text-white"
                      )}
                    >
                      {type === 'gaussian' ? 'Gaussian' : 'S & P'}
                    </button>
                  ))}
                </div>
                <input 
                  type="range" min="0.05" max="0.4" step="0.01" 
                  value={intensity} 
                  onChange={(e) => setIntensity(parseFloat(e.target.value))}
                  className="w-full accent-accent-cyan bg-white/5 h-1.5 rounded-full appearance-none cursor-pointer"
                />
              </div>

              {/* Advanced Parameters */}
              <div className="space-y-8 pt-6 border-t border-white/5">
                <div className="space-y-4">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                    <span className="text-white/30">Gaussian Sigma</span>
                    <span className="text-accent-cyan">{sigma.toFixed(1)}</span>
                  </div>
                  <input 
                    type="range" min="0.5" max="5.0" step="0.1" 
                    value={sigma} 
                    onChange={(e) => setSigma(parseFloat(e.target.value))}
                    className="w-full accent-accent-cyan bg-white/5 h-1 rounded-full appearance-none cursor-pointer"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                    <span className="text-white/30">Median Kernel</span>
                    <span className="text-accent-purple">{kernelSize}x{kernelSize}</span>
                  </div>
                  <input 
                    type="range" min="3" max="11" step="2" 
                    value={kernelSize} 
                    onChange={(e) => setKernelSize(parseInt(e.target.value))}
                    className="w-full accent-accent-purple bg-white/5 h-1 rounded-full appearance-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button 
                  onClick={() => handleProcess(currentImg)}
                  disabled={loading}
                  className="flex-[3] h-16 rounded-2xl bg-white text-black font-black uppercase text-xs tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                      <Activity className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Run Analytics
                    </>
                  )}
                </button>
                <button 
                  onClick={lockState}
                  className="flex-1 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group"
                  title="Share State"
                >
                  <Share2 className="w-5 h-5 text-white/40 group-hover:text-accent-cyan transition-colors" />
                </button>
              </div>
            </div>

            {/* Performance/Logs Panel */}
            <div className="glass-card p-6 rounded-[32px] space-y-4">
               <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 flex items-center gap-2">
                 <Activity className="w-3 h-3" />
                 Live Diagnostics
               </h3>
               <div className="space-y-2">
                 {logs.map((log, i) => (
                   <div key={i} className={cn(
                     "text-[9px] font-mono flex items-center gap-2",
                     i === 0 ? "text-accent-cyan" : "text-white/20"
                   )}>
                     <span className="opacity-50">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                     {log}
                   </div>
                 ))}
               </div>
            </div>
          </aside>

          {/* Results Grid */}
          <section className="space-y-8">
            {/* View Switcher */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar p-1 bg-white/5 border border-white/5 rounded-2xl w-fit">
              {(['all', 'noise', 'filter', 'edges'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === tab ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div 
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {(activeTab === 'all' || activeTab === 'noise') && (
                  <>
                    <StageCard 
                      id="01" 
                      title="ORIGINAL" 
                      img={images?.original} 
                      loading={loading}
                      meta="Baseline"
                    />
                    <StageCard 
                      id="02" 
                      title="NOISY" 
                      img={images?.noisy} 
                      loading={loading}
                      meta={`${noiseType.toUpperCase()} @ ${intensity * 100}%`}
                      highlight="red"
                      time={performance?.noise}
                    />
                  </>
                )}
                {(activeTab === 'all' || activeTab === 'filter') && (
                  <>
                    <StageCard 
                      id="03" 
                      title="GAUSSIAN" 
                      img={images?.filterA} 
                      loading={loading}
                      meta={`Sigma: ${sigma}`}
                      analysis="Efisien meredam noise gaussian melalui perataan statistik."
                      highlight="cyan"
                      time={performance?.filtering}
                    />
                    <StageCard 
                      id="04" 
                      title="MEDIAN" 
                      img={images?.filterB} 
                      loading={loading}
                      meta={`Kernel: ${kernelSize}x${kernelSize}`}
                      analysis="Sangat superior menghapus noise salt & pepper, menjaga integritas tepi."
                      highlight="purple"
                      time={performance?.filtering}
                    />
                  </>
                )}
                {(activeTab === 'all' || activeTab === 'edges') && (
                  <>
                    <StageCard 
                      id="05" 
                      title="SOBEL (A)" 
                      img={images?.edgeA} 
                      loading={loading}
                      meta="Pre-filtered Gaussian"
                      analysis="Deteksi tepi dari input Gaussian. Garis terlihat lebih halus."
                      highlight="cyan"
                      time={performance?.edges}
                    />
                    <StageCard 
                      id="06" 
                      title="SOBEL (B)" 
                      img={images?.edgeB} 
                      loading={loading}
                      meta="Pre-filtered Median"
                      analysis="Deteksi tepi dari input Median. Garis terlihat sangat tajam."
                      highlight="purple"
                      time={performance?.edges}
                    />
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-24 pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8 opacity-40">
          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.3em]">
             <span className="text-accent-cyan">Kelompok 5</span>
             <span className="text-white/20">|</span>
             <span>Computer Vision 2026</span>
          </div>
          <div className="flex gap-3">
             {['FastAPI', 'NumPy', 'Next.js 16', 'Framer Motion'].map(t => (
               <span key={t} className="px-3 py-1 rounded-lg bg-white/5 border border-white/5 text-[8px] font-bold uppercase tracking-widest">{t}</span>
             ))}
          </div>
        </footer>
      </main>

      {/* Mobile Error Toast */}
      {error && (
        <motion.div 
          initial={{ y: 100 }} animate={{ y: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl bg-red-500 text-white font-black uppercase text-[10px] tracking-widest flex items-center gap-3 shadow-2xl shadow-red-500/40"
        >
          <AlertCircle className="w-4 h-4" />
          {error}
        </motion.div>
      )}
    </div>
  );
}

function StageCard({ id, title, img, loading, meta, analysis, highlight, time }: any) {
  const [isZoomed, setIsZoomed] = useState(false);

  return (
    <div className="group space-y-4">
      <div className="flex justify-between items-end px-1">
        <div className="space-y-1">
          <div className={cn(
            "text-[9px] font-black tracking-widest uppercase opacity-40",
            highlight === 'cyan' && "text-accent-cyan opacity-100",
            highlight === 'purple' && "text-accent-purple opacity-100",
          )}>Stage {id}</div>
          <h3 className="text-xl font-black tracking-tighter italic">{title}</h3>
        </div>
        <div className="flex flex-col items-end gap-1">
          {time && <span className="text-[8px] font-mono text-white/30">{time}ms</span>}
          <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">{meta}</span>
        </div>
      </div>

      <div className={cn(
        "relative aspect-[4/3] rounded-[32px] overflow-hidden glass-card-heavy border-white/5 transition-all duration-500 group-hover:scale-[1.02] group-hover:border-white/20 group-hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)]",
        isZoomed && "fixed inset-10 z-[200] aspect-auto group-hover:scale-100"
      )}>
        {loading && (
          <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center gap-4">
             <motion.div 
               animate={{ rotate: 360 }} 
               transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
               className="w-10 h-10 border-2 border-accent-cyan/20 border-t-accent-cyan rounded-full"
             />
             <span className="text-[9px] font-black uppercase tracking-[0.4em] text-accent-cyan">Computing</span>
          </div>
        )}

        {img ? (
          <>
            <img 
              src={img} 
              alt={title} 
              className={cn(
                "w-full h-full object-cover transition-all duration-700",
                isZoomed ? "object-contain" : "group-hover:scale-110",
                loading && "opacity-20 blur-xl"
              )} 
            />
            <button 
              onClick={() => setIsZoomed(!isZoomed)}
              className="absolute top-6 right-6 p-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Maximize2 className="w-4 h-4 text-white/60" />
            </button>
            
            {analysis && !isZoomed && (
              <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black via-black/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out">
                <div className={cn(
                  "w-12 h-1 mb-3 rounded-full",
                  highlight === 'cyan' ? "bg-accent-cyan" : highlight === 'purple' ? "bg-accent-purple" : "bg-white"
                )} />
                <p className="text-[10px] font-bold text-white/70 leading-relaxed uppercase tracking-wider">{analysis}</p>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 opacity-20">
             <ImageIcon className="w-12 h-12" />
             <span className="text-[10px] font-black uppercase tracking-widest">Waiting for Signal</span>
          </div>
        )}
      </div>
    </div>
  );
}
