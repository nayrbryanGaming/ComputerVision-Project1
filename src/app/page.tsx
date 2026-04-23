'use client';

import { useState, useEffect, useCallback } from 'react';
import { processImagePython, ImageState } from '@/utils/cv-utils';

const NOISE_LEVELS = [0.1, 0.2, 0.3];
const DEFAULT_IMAGE_PATH = '/default.png';

export default function CVProject() {
  const [images, setImages] = useState<ImageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [noiseType, setNoiseType] = useState<'gaussian' | 'salt_and_pepper'>('gaussian');
  const [intensity, setIntensity] = useState(0.1);
  const [error, setError] = useState<string | null>(null);

  const handleProcess = useCallback(async (source: File | string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await processImagePython(source, noiseType, intensity);
      setImages(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to process image. Make sure the Python backend is running.');
    } finally {
      setLoading(false);
    }
  }, [noiseType, intensity]);

  useEffect(() => {
    handleProcess(DEFAULT_IMAGE_PATH);
  }, []);

  const onFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File too large. Max 5MB.');
        return;
      }
      handleProcess(file);
    }
  };

  return (
    <main className="min-h-screen bg-[#050505] text-slate-100 p-4 md:p-8 font-sans overflow-x-hidden selection:bg-fuchsia-500/30">
      {/* Background Ornaments */}
      <div className="fixed top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-fuchsia-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-12 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <div className="inline-block px-3 py-1 mb-4 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-xs font-semibold tracking-widest text-fuchsia-400 uppercase">
              Kelompok 5 • Assignment 01
            </div>
            <h1 className="text-4xl md:text-6xl font-black bg-gradient-to-br from-white via-slate-200 to-slate-500 bg-clip-text text-transparent tracking-tight">
              Computer Vision
            </h1>
            <p className="mt-2 text-slate-400 text-lg">
              Noise Analysis, Filtering & Edge Detection via Pure Python Backend
            </p>
          </div>
          <div className="flex gap-4">
            <div className="px-6 py-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md flex flex-col items-center justify-center">
              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Engine</span>
              <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">PYTHON 3</span>
            </div>
            <div className="px-6 py-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md flex flex-col items-center justify-center">
              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Status</span>
              <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                ONLINE
              </span>
            </div>
          </div>
        </header>

        {/* Control Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
          
          {/* Action Card */}
          <div className="col-span-1 lg:col-span-4 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-500/20 to-transparent rounded-bl-full pointer-events-none" />
            
            <div>
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Image Source
              </h2>
              
              <div className="flex flex-col gap-3">
                <label className="group relative cursor-pointer overflow-hidden rounded-2xl bg-gradient-to-r from-fuchsia-600 to-blue-600 p-[1px] transition-all hover:shadow-[0_0_2rem_-0.5rem_#d946ef]">
                  <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-600 to-blue-600 opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="relative flex h-full w-full items-center justify-center gap-2 rounded-2xl bg-[#0a0a0a] px-6 py-4 transition-all group-hover:bg-opacity-0">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="font-bold text-white tracking-wide">Upload Custom Image</span>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={onFileUpload} disabled={loading} />
                </label>
                
                <button
                  onClick={() => handleProcess(DEFAULT_IMAGE_PATH)}
                  disabled={loading}
                  className="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-sm font-bold text-slate-300 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset to Default
                </button>
              </div>
            </div>
          </div>

          {/* Configuration Card */}
          <div className="col-span-1 lg:col-span-8 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 flex flex-col md:flex-row gap-8 items-center">
            
            <div className="flex-1 w-full space-y-6">
              <div>
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  Noise Configuration
                </h2>
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                  {(['gaussian', 'salt_and_pepper'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setNoiseType(type)}
                      className={`flex-1 px-4 py-3 rounded-lg text-xs font-bold transition-all uppercase tracking-wider ${
                        noiseType === type 
                          ? 'bg-white/10 text-white shadow-lg' 
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {type.replace('_', ' & ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Intensity</span>
                  <span className="text-xs font-black text-fuchsia-400 bg-fuchsia-400/10 px-2 py-1 rounded-md">
                    {(intensity * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex gap-2">
                  {NOISE_LEVELS.map((level) => (
                    <button
                      key={level}
                      onClick={() => setIntensity(level)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${
                        intensity === level 
                          ? 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300' 
                          : 'bg-black/40 border-white/5 text-slate-500 hover:border-white/20'
                      }`}
                    >
                      {(level * 100).toFixed(0)}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Run Action */}
            <div className="w-full md:w-auto flex flex-col justify-end h-full">
              <button
                onClick={() => handleProcess(images?.original || DEFAULT_IMAGE_PATH)}
                disabled={loading}
                className={`relative group overflow-hidden rounded-2xl px-12 py-8 transition-all ${
                  loading 
                    ? 'bg-white/5 cursor-not-allowed' 
                    : 'bg-white text-black hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_rgba(255,255,255,0.5)]'
                }`}
              >
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-slate-500 border-t-white rounded-full animate-spin" />
                    <span className="text-slate-400 font-bold tracking-widest text-xs uppercase">Processing via Python...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-black text-xl tracking-tight">RUN PIPELINE</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">via API Endpoint</span>
                  </div>
                )}
              </button>
            </div>

          </div>
        </div>

        {error && (
          <div className="mb-8 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-2xl text-center font-bold text-sm flex items-center justify-center gap-3 animate-pulse">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        )}

        {/* Results Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ImageCard 
            title="01 / Original Image" 
            src={images?.original} 
            loading={loading} 
            badge="Baseline"
          />
          <ImageCard 
            title="02 / Noisy Image" 
            src={images?.noisy} 
            loading={loading} 
            badge={noiseType.replace('_', ' ').toUpperCase()}
            badgeColor="bg-red-500/20 text-red-400 border-red-500/30"
          />
          <ImageCard 
            title="03 / Gaussian Filter" 
            src={images?.filterA} 
            loading={loading} 
            description="Meredam noise dengan efek blur halus, edge sedikit memudar."
            badge="Filter"
            badgeColor="bg-blue-500/20 text-blue-400 border-blue-500/30"
          />
          <ImageCard 
            title="04 / Median Filter" 
            src={images?.filterB} 
            loading={loading} 
            description="Sangat efektif menghapus salt & pepper noise, edge tetap tajam."
            badge="Filter"
            badgeColor="bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30"
          />
          <ImageCard 
            title="05 / Sobel (from Gaussian)" 
            src={images?.edgeA} 
            loading={loading} 
            description="Deteksi tepi dari hasil Gaussian Filter."
            badge="Edge"
            badgeColor="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          />
          <ImageCard 
            title="06 / Sobel (from Median)" 
            src={images?.edgeB} 
            loading={loading} 
            description="Deteksi tepi dari hasil Median Filter. Terlihat lebih tegas."
            badge="Edge"
            badgeColor="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          />
        </div>

        {/* Footer Info */}
        <footer className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 pb-12">
          <div className="text-slate-500 text-sm font-medium">
            © 2026 Kelompok 5
          </div>
          <div className="flex gap-3">
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-xs text-slate-400 font-medium">
              Next.js App Router
            </span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-xs text-slate-400 font-medium">
              Python FastAPI Backend
            </span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-xs text-slate-400 font-medium">
              Tailwind CSS
            </span>
          </div>
        </footer>
      </div>
    </main>
  );
}

function ImageCard({ title, src, loading, description, badge, badgeColor = "bg-slate-500/20 text-slate-400 border-slate-500/30" }: { 
  title: string; 
  src?: string; 
  loading: boolean; 
  description?: string;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <div className="group rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden transition-all hover:bg-white/10 hover:border-white/20 hover:shadow-2xl hover:shadow-black/50 flex flex-col h-full">
      <div className="p-5 border-b border-white/5 flex justify-between items-center">
        <h3 className="font-bold text-white tracking-wide text-sm">{title}</h3>
        {badge && (
          <span className={`text-[10px] uppercase font-black px-2 py-1 rounded border tracking-wider ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>
      
      <div className="relative aspect-square md:aspect-[4/3] bg-black/50 overflow-hidden flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-t-2 border-white animate-spin" />
                <div className="absolute inset-2 rounded-full border-b-2 border-fuchsia-500 animate-spin animation-delay-150" />
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-widest animate-pulse">
                Backend Processing...
              </span>
            </div>
          </div>
        )}
        
        {src ? (
          <img 
            src={src} 
            alt={title} 
            className={`w-full h-full object-cover transition-all duration-700 ${loading ? 'scale-105 opacity-50 blur-sm' : 'scale-100 opacity-100 group-hover:scale-105'}`} 
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {description && (
        <div className="p-5 bg-black/20 border-t border-white/5">
          <p className="text-xs text-slate-400 leading-relaxed font-medium">
            {description}
          </p>
        </div>
      )}
    </div>
  );
}
