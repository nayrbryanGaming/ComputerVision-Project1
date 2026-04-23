
'use client';

import { useState, useEffect, useCallback } from 'react';
import { processImage, ImageState } from '@/utils/cv-utils';

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
      const result = await processImage(source, noiseType, intensity);
      setImages(result);
    } catch (err) {
      console.error(err);
      setError('Failed to process image. Please try another one.');
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
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-12 text-center">
        <h1 className="text-4xl md:text-6xl font-black bg-gradient-to-r from-cyan-400 to-blue-600 bg-clip-text text-transparent mb-4">
          Computer Vision Lab
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          Tugas 1: Analisis Eksperimen Filtering & Deteksi Tepi - Kelompok 5
        </p>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 bg-slate-900/50 p-6 rounded-3xl border border-slate-800 backdrop-blur-xl shadow-2xl">
        {/* Upload Section */}
        <div className="space-y-4">
          <label className="block text-sm font-bold text-slate-400 uppercase tracking-widest">Image Source</label>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => handleProcess(DEFAULT_IMAGE_PATH)}
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all border border-slate-700 text-sm font-medium"
            >
              Reset to Default
            </button>
            <label className="relative cursor-pointer px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl transition-all text-center text-sm font-bold shadow-lg shadow-blue-900/20">
              Upload Custom Image
              <input type="file" className="hidden" accept="image/*" onChange={onFileUpload} />
            </label>
          </div>
        </div>

        {/* Noise Settings */}
        <div className="space-y-4">
          <label className="block text-sm font-bold text-slate-400 uppercase tracking-widest">Noise Configuration</label>
          <div className="flex gap-2">
            {(['gaussian', 'salt_and_pepper'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setNoiseType(type)}
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                  noiseType === type ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {type.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {NOISE_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setIntensity(level)}
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                  intensity === level ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {(level * 100).toFixed(0)}%
              </button>
            ))}
          </div>
        </div>

        {/* Action */}
        <div className="flex items-end">
          <button
            onClick={() => handleProcess(images?.original || DEFAULT_IMAGE_PATH)}
            disabled={loading}
            className={`w-full py-4 rounded-2xl font-black text-lg transition-all shadow-2xl ${
              loading 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            {loading ? 'PROCESSING...' : 'APPLY FILTERS'}
          </button>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto mb-8 bg-red-500/10 border border-red-500 text-red-400 p-4 rounded-xl text-center font-bold">
          {error}
        </div>
      )}

      {/* Results Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          <ImageCard title="Original Image" src={images?.original} loading={loading} />
          <ImageCard title={`Noisy Image (${noiseType})`} src={images?.noisy} loading={loading} />
          <ImageCard title="Gaussian Filter" src={images?.filterA} loading={loading} description="Blurs noise but softens edges" />
          <ImageCard title="Median Filter" src={images?.filterB} loading={loading} description="Removes impulsive noise, preserves edges" />
          <ImageCard title="Edge Detection (Sobel-A)" src={images?.edgeA} loading={loading} description="Edges from Gaussian Filtered" />
          <ImageCard title="Edge Detection (Sobel-B)" src={images?.edgeB} loading={loading} description="Edges from Median Filtered" />
        </div>
      </div>

      {/* Footer Info */}
      <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-slate-900 text-slate-500 text-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <p>© 2026 Kelompok 5 - Computer Vision Project</p>
        <div className="flex gap-4">
          <span>Processing: Client-side (Web Worker)</span>
          <span>•</span>
          <span>Library: Vanilla JS / Canvas</span>
        </div>
      </div>
    </main>
  );
}

function ImageCard({ title, src, loading, description }: { title: string; src?: string; loading: boolean; description?: string }) {
  return (
    <div className="group bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-xl hover:border-slate-700 transition-all">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <h3 className="font-bold text-slate-300 text-sm tracking-tight">{title}</h3>
        <div className={`w-2 h-2 rounded-full ${loading ? 'bg-cyan-500 animate-pulse' : 'bg-slate-700'}`} />
      </div>
      <div className="aspect-[4/3] bg-slate-950 relative overflow-hidden">
        {src ? (
          <img src={src} alt={title} className="w-full h-full object-contain" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-slate-800 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        )}
      </div>
      {description && (
        <div className="p-4 bg-slate-900/50">
          <p className="text-xs text-slate-500 italic leading-relaxed">{description}</p>
        </div>
      )}
    </div>
  );
}
