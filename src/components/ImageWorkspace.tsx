'use client';

import { useState, useRef, useEffect, useCallback, memo } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProcessResult {
  success: boolean;
  processing_time_ms: number;
  images: Record<string, string>;
  metrics: {
    psnr_noisy_gaussian: number;
    psnr_noisy_salt_pepper: number;
    psnr_filtered_gauss_gaussian: number;
    psnr_filtered_gauss_median: number;
    psnr_filtered_sp_gaussian: number;
    psnr_filtered_sp_median: number;
    ssim_noisy_gaussian: number;
    ssim_filtered_gauss_gaussian: number;
    ssim_filtered_sp_median: number;
    edge_count_gauss_gaussian: number;
    edge_count_gauss_median: number;
    edge_count_sp_gaussian: number;
    edge_count_sp_median: number;
  };
  analysis: {
    gaussian_noise_winner: string;
    salt_pepper_noise_winner: string;
    reasoning_gaussian: string;
    reasoning_salt_pepper: string;
    edge_performance: string;
    summary: string;
  };
}

type NoiseType  = 'both' | 'gaussian' | 'salt_pepper';
type EdgeMethod = 'sobel' | 'prewitt' | 'log' | 'canny';

// ─── Utility: client-side image resize ───────────────────────────────────────
// Keeps payload under ~300 KB — prevents Vercel's 4.5 MB body limit from firing

function compressToJpeg(dataUrl: string, maxDim = 800): Promise<{ b64: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      if (Math.max(w, h) > maxDim) {
        const s = maxDim / Math.max(w, h);
        w = Math.floor(w * s);
        h = Math.floor(h * s);
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve({ b64: c.toDataURL('image/jpeg', 0.85), w, h });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ─── Sub-components (memo to skip re-renders) ────────────────────────────────

const Spinner = memo(function Spinner({ large }: { large?: boolean }) {
  return <div className={large ? 'spinner spinner-lg' : 'spinner'} />;
});
Spinner.displayName = 'Spinner';

const ImageCard = memo(function ImageCard({
  title, src, psnr, edgeCount, winner,
  onExpand, onDownload, dlName,
}: {
  title: string; src: string; psnr?: number; edgeCount?: number;
  winner?: boolean; onExpand: (s: string) => void;
  onDownload: (s: string, n: string) => void; dlName: string;
}) {
  const psnrColor = psnr === undefined ? '' : psnr > 40 ? '#16a34a' : psnr > 30 ? '#1e40af' : '#d97706';

  return (
    <div className="img-card">
      <div className="img-frame" onClick={() => onExpand(src)} title="Klik untuk perbesar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={title} loading="lazy" decoding="async" />
        {winner && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: '#16a34a', color: '#fff',
            fontSize: '.65rem', fontWeight: 800,
            padding: '2px 7px', borderRadius: '999px',
            letterSpacing: '.05em', textTransform: 'uppercase',
          }}>WINNER</div>
        )}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <p style={{ fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase',
                     letterSpacing: '.05em', color: 'var(--text-muted)',
                     marginBottom: 4, lineHeight: 1.3 }}>
          {title}
        </p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {psnr !== undefined && (
            <span style={{
              fontFamily: 'var(--font-geist-mono, monospace)',
              fontWeight: 700, fontSize: '.8rem', color: psnrColor,
            }}>{psnr} dB</span>
          )}
          {edgeCount !== undefined && (
            <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
              {edgeCount.toLocaleString()} px tepi
            </span>
          )}
          <button
            className="btn-dl"
            onClick={() => onDownload(src, dlName)}
            title="Unduh gambar"
          >↓</button>
        </div>
      </div>
    </div>
  );
});
ImageCard.displayName = 'ImageCard';

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImageWorkspace() {
  // ── Image state ────────────────────────────────────────────────────────────
  const [img, setImg] = useState<{ b64: string; w: number; h: number } | null>(null);
  const [inputTab, setInputTab] = useState<'default' | 'upload'>('default');
  const [dragging, setDragging] = useState(false);

  // ── Parameters ─────────────────────────────────────────────────────────────
  const [noiseType,     setNoiseType]     = useState<NoiseType>('both');
  const [noiseLevel,    setNoiseLevel]    = useState(20);
  const [edgeMethod,    setEdgeMethod]    = useState<EdgeMethod>('sobel');
  const [edgeThr,       setEdgeThr]       = useState(50);
  const [cannyLow,      setCannyLow]      = useState(100);
  const [cannyHigh,     setCannyHigh]     = useState(140);
  const [kernelSize,    setKernelSize]    = useState<3 | 5>(3);
  const [paramsChanged, setParamsChanged] = useState(false);

  // ── Process state ──────────────────────────────────────────────────────────
  const [results,  setResults]  = useState<ProcessResult | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [elapsed,  setElapsed]  = useState(0);
  const [msgIdx,   setMsgIdx]   = useState(0);
  const [modal,    setModal]    = useState<string | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const MSGS = [
    'Mengurai gambar input…',
    'Menerapkan Gaussian Noise…',
    'Menerapkan Salt & Pepper Noise…',
    'Menerapkan Gaussian Filter…',
    'Menerapkan Median Filter…',
    'Mendeteksi tepi…',
    'Menghitung PSNR & SSIM…',
    'Menyusun analisis…',
  ];

  // ── Load default on mount ──────────────────────────────────────────────────
  useEffect(() => { loadDefault(); }, []);

  const loadDefault = async () => {
    try {
      const res = await fetch('/api/default_image');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.image_base64) {
        const { b64, w, h } = await compressToJpeg(data.image_base64, 800);
        setImg({ b64, w, h });
      }
    } catch {
      // fallback: read city.png directly
      try {
        const blob = await (await fetch('/city.png')).blob();
        const dataUrl = await new Promise<string>((res) => {
          const fr = new FileReader(); fr.onload = e => res(e.target!.result as string); fr.readAsDataURL(blob);
        });
        const { b64, w, h } = await compressToJpeg(dataUrl, 800);
        setImg({ b64, w, h });
      } catch { /* ignore */ }
    }
  };

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Format tidak didukung. Gunakan JPG, PNG, atau WEBP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File terlalu besar (maks 10 MB).');
      return;
    }
    const raw = await new Promise<string>(res => {
      const fr = new FileReader(); fr.onload = e => res(e.target!.result as string); fr.readAsDataURL(file);
    });
    const { b64, w, h } = await compressToJpeg(raw, 800);
    setImg({ b64, w, h });
    setError(null);
  }, []);

  // ── Process ────────────────────────────────────────────────────────────────
  const handleProcess = useCallback(async () => {
    if (!img) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setElapsed(0);
    setMsgIdx(0);
    setParamsChanged(false);

    timerRef.current   = setInterval(() => setElapsed(n => n + 1), 1000);
    msgTimerRef.current = setInterval(() => setMsgIdx(n => (n + 1) % MSGS.length), 1800);

    try {
      const ctrl    = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 30_000);

      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: img.b64,
          noise_type:     noiseType,
          noise_level:    noiseLevel,
          filter_a:       'gaussian',
          filter_b:       'median',
          edge_method:    edgeMethod,
          edge_threshold: edgeThr,
          canny_low:      cannyLow,
          canny_high:     cannyHigh,
          kernel_size:    kernelSize,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (!data.success) {
        setError(data.error_message || 'Processing gagal.');
      } else {
        setResults(data);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
      }
    } catch (e: unknown) {
      const err = e as Error;
      setError(
        err.name === 'AbortError'
          ? 'Timeout (>30 detik). Coba dengan gambar lebih kecil atau refresh halaman.'
          : (err.message || 'Kesalahan jaringan.'),
      );
    } finally {
      setLoading(false);
      if (timerRef.current)    clearInterval(timerRef.current);
      if (msgTimerRef.current) clearInterval(msgTimerRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, noiseType, noiseLevel, edgeMethod, edgeThr, cannyLow, cannyHigh, kernelSize]);

  const downloadImage = useCallback((src: string, name: string) => {
    const a = document.createElement('a');
    a.href = src; a.download = name + '.png'; a.click();
  }, []);

  const mark = (fn: () => void) => { fn(); setParamsChanged(true); };

  const noiseLvlLabel = noiseLevel === 10 ? 'ringan' : noiseLevel === 20 ? 'sedang' : 'berat';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── MODAL ──────────────────────────────────────────────────────────── */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={modal} alt="Full size" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="site-header">
        <div className="container">
          <span className="header-pill">Computer Vision · Tugas 1 · Kelompok 5</span>
          <h1 className="header-title">CV Pipeline Demo</h1>
          <p className="header-sub">Noise → Filtering → Edge Detection · Analisis Interaktif</p>
          <div className="member-list">
            {['2361020 – Venilia', '2361021 – Vincentius', '2361022 – Vincentlee',
              '2361023 – Rendy', '2361024 – Felisitas'].map(m => (
              <span key={m} className="member-chip">{m}</span>
            ))}
          </div>
        </div>
      </header>

      <main className="container site-main">

        {/* ── 1. IMAGE INPUT ─────────────────────────────────────────────────── */}
        <section className="card section-card">
          <h2 className="section-title">
            <span className="step-num">1</span>Pilih Gambar Input
          </h2>

          <div className="tab-row">
            {(['default', 'upload'] as const).map(t => (
              <button key={t}
                className={`tab-btn${inputTab === t ? ' tab-active' : ''}`}
                onClick={() => { setInputTab(t); if (t === 'default') loadDefault(); }}
              >
                {t === 'default' ? '🖼 Gambar Default' : '📁 Upload Sendiri'}
              </button>
            ))}
          </div>

          <div className="input-layout">
            {/* Preview */}
            <div className="preview-wrap">
              {img ? (
                <div className="preview-box">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.b64} alt="Preview" />
                </div>
              ) : (
                <div className="preview-empty">No image</div>
              )}
              {img && (
                <p className="preview-info">
                  {img.w} × {img.h} px
                </p>
              )}
            </div>

            {/* Right panel */}
            <div className="input-right">
              {inputTab === 'default' ? (
                <div className="default-notice">
                  <span style={{ fontSize: '1.5rem' }}>🏙</span>
                  <div>
                    <p style={{ fontWeight: 700, marginBottom: 4 }}>Gambar kota/bangunan terpilih</p>
                    <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
                      Kaya garis lurus — ideal untuk demonstrasi deteksi tepi.
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className={`dropzone${dragging ? ' drag-over' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => {
                    e.preventDefault(); setDragging(false);
                    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
                  }}
                  onClick={() => document.getElementById('cv-file')?.click()}
                >
                  <input id="cv-file" type="file" accept=".jpg,.jpeg,.png,.webp"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value=''; }}
                  />
                  <p style={{ fontSize: '2rem', marginBottom: 8 }}>📂</p>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>Drag & drop atau klik</p>
                  <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                    JPG · PNG · WEBP — maks 10 MB
                  </p>
                  <p style={{ fontSize: '.75rem', color: 'var(--primary)', marginTop: 6 }}>
                    Otomatis di-resize ke ≤800 px sebelum diproses
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── 2. PARAMETERS ──────────────────────────────────────────────────── */}
        <section className="card section-card">
          <h2 className="section-title">
            <span className="step-num">2</span>Atur Parameter
          </h2>

          <div className="param-grid">

            {/* Noise */}
            <div className="param-block">
              <p className="param-label">Jenis Noise</p>
              <div className="toggle-group">
                {([['both','Keduanya'],['gaussian','Gaussian'],['salt_pepper','Salt & Pepper']] as [NoiseType,string][]).map(([v, lbl]) => (
                  <button key={v} disabled={loading}
                    className={`toggle-btn${noiseType===v?' active':''}`}
                    onClick={() => mark(() => setNoiseType(v))}>
                    {lbl}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="slider-header">
                  <span>Intensitas: {noiseLevel}%</span>
                  <span className="slider-val">{noiseLvlLabel}</span>
                </div>
                <input type="range" min={10} max={30} step={10} value={noiseLevel}
                  disabled={loading}
                  onChange={e => mark(() => setNoiseLevel(+e.target.value))} />
                <div style={{ display:'flex', justifyContent:'space-between',
                               fontSize:'.7rem', color:'var(--text-subtle)', marginTop:2 }}>
                  <span>10% ringan</span><span>20% sedang</span><span>30% berat</span>
                </div>
              </div>
            </div>

            {/* Filter */}
            <div className="param-block">
              <p className="param-label">Filter</p>
              <div className="filter-info">
                <div className="filter-chip filter-chip-blue">Gaussian Filter</div>
                <span style={{ color:'var(--text-muted)' }}>+</span>
                <div className="filter-chip filter-chip-green">Median Filter</div>
              </div>
              <div style={{ marginTop: 14 }}>
                <p className="param-label" style={{ marginBottom: 8 }}>Ukuran Kernel</p>
                <div className="toggle-group">
                  {([3,5] as (3|5)[]).map(k => (
                    <button key={k} disabled={loading}
                      className={`toggle-btn${kernelSize===k?' active':''}`}
                      onClick={() => mark(() => setKernelSize(k))}>
                      {k}×{k}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Edge */}
            <div className="param-block">
              <p className="param-label">Deteksi Tepi</p>
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize:'.8rem', color:'var(--text-muted)', fontWeight:600,
                             marginBottom:6 }}>Metode</p>
                <select value={edgeMethod} disabled={loading}
                  onChange={e => mark(() => setEdgeMethod(e.target.value as EdgeMethod))}
                  className="cv-select">
                  <option value="sobel">Sobel</option>
                  <option value="prewitt">Prewitt</option>
                  <option value="log">LoG (Laplacian of Gaussian)</option>
                  <option value="canny">Canny</option>
                </select>
              </div>

              {edgeMethod !== 'canny' ? (
                <>
                  <div className="slider-header">
                    <span>Threshold</span>
                    <span className="slider-val">{edgeThr}</span>
                  </div>
                  <input type="range" min={0} max={255} step={5} value={edgeThr}
                    disabled={loading}
                    onChange={e => mark(() => setEdgeThr(+e.target.value))} />
                </>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div>
                    <div className="slider-header">
                      <span>Low</span><span className="slider-val">{cannyLow}</span>
                    </div>
                    <input type="range" min={0} max={200} step={5} value={cannyLow}
                      disabled={loading}
                      onChange={e => {
                        const v = +e.target.value;
                        mark(() => { setCannyLow(v); if (v >= cannyHigh) setCannyHigh(v+10); });
                      }} />
                  </div>
                  <div>
                    <div className="slider-header">
                      <span>High</span><span className="slider-val">{cannyHigh}</span>
                    </div>
                    <input type="range" min={10} max={255} step={5} value={cannyHigh}
                      disabled={loading}
                      onChange={e => {
                        const v = +e.target.value;
                        mark(() => { setCannyHigh(v); if (v <= cannyLow) setCannyLow(v-10); });
                      }} />
                  </div>
                </div>
              )}
            </div>

          </div>{/* /param-grid */}

          {/* Error */}
          {error && !loading && (
            <div className="alert-error">
              <span style={{ fontSize:'1.1rem', flexShrink:0 }}>⚠</span>
              <div style={{ flex:1 }}>
                <p style={{ fontWeight:700, marginBottom:2 }}>Error</p>
                <p style={{ fontSize:'.875rem' }}>{error}</p>
              </div>
              <button className="btn-ghost-sm" onClick={() => setError(null)}>✕</button>
            </div>
          )}

          {/* CTA button */}
          <button
            className={`process-btn${paramsChanged && results ? ' changed' : ''}${loading ? ' loading' : ''}`}
            onClick={handleProcess}
            disabled={loading || !img}
          >
            {loading ? <><Spinner /> Memproses…</> :
             paramsChanged && results ? '🔄 Parameter berubah — Proses Ulang' :
             '🚀 Proses Sekarang'}
          </button>
        </section>

        {/* ── LOADING ─────────────────────────────────────────────────────────── */}
        {loading && (
          <section className="card section-card loading-card fade-up">
            <Spinner large />
            <p className="loading-msg">{MSGS[msgIdx]}</p>
            <p className="loading-sub">{elapsed}s berlalu…</p>
            <div className="progress-bar"><div className="progress-bar-fill" /></div>
          </section>
        )}

        {/* ── RESULTS ─────────────────────────────────────────────────────────── */}
        {results && !loading && (
          <div ref={resultsRef} className="fade-up">

            {/* Meta bar */}
            <div className="results-meta">
              <h2 className="results-title">Hasil Processing</h2>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <span className="meta-chip chip-green">✓ {results.processing_time_ms} ms</span>
                <span className="meta-chip chip-blue">Kernel {kernelSize}×{kernelSize}</span>
                <span className="meta-chip chip-blue">{edgeMethod.toUpperCase()}</span>
                <span className="meta-chip chip-blue">Noise {noiseLevel}%</span>
              </div>
            </div>

            {/* ROW 1 — Original */}
            <div className="result-row">
              <div className="row-header">
                <div className="row-dot" style={{ background:'#64748b' }} />
                <span>Original (Grayscale)</span>
              </div>
              <div className="grid-1">
                <ImageCard title="Original" src={results.images.original}
                  dlName="original" onExpand={setModal} onDownload={downloadImage} />
              </div>
            </div>

            {/* ROW 2 — Gaussian noise */}
            <div className="result-row">
              <div className="row-header">
                <div className="row-dot" style={{ background:'#f59e0b' }} />
                <div>
                  <span>Gaussian Noise Pipeline</span>
                  <span className="row-sub">PSNR noisy: {results.metrics.psnr_noisy_gaussian} dB · SSIM: {results.metrics.ssim_noisy_gaussian}</span>
                </div>
              </div>
              <div className="img-grid-3">
                <ImageCard title="Noisy (Gaussian)"
                  src={results.images.noisy_gaussian}
                  psnr={results.metrics.psnr_noisy_gaussian}
                  dlName="noisy_gaussian" onExpand={setModal} onDownload={downloadImage} />
                <ImageCard title="Gaussian Filter"
                  src={results.images.filtered_gauss_gaussian}
                  psnr={results.metrics.psnr_filtered_gauss_gaussian}
                  winner={results.analysis.gaussian_noise_winner === 'gaussian_filter'}
                  dlName="filtered_gauss_gaussian" onExpand={setModal} onDownload={downloadImage} />
                <ImageCard title="Median Filter"
                  src={results.images.filtered_gauss_median}
                  psnr={results.metrics.psnr_filtered_gauss_median}
                  winner={results.analysis.gaussian_noise_winner === 'median_filter'}
                  dlName="filtered_gauss_median" onExpand={setModal} onDownload={downloadImage} />
              </div>
            </div>

            {/* ROW 3 — S&P noise */}
            <div className="result-row">
              <div className="row-header">
                <div className="row-dot" style={{ background:'#ef4444' }} />
                <div>
                  <span>Salt & Pepper Noise Pipeline</span>
                  <span className="row-sub">PSNR noisy: {results.metrics.psnr_noisy_salt_pepper} dB</span>
                </div>
              </div>
              <div className="img-grid-3">
                <ImageCard title="Noisy (Salt & Pepper)"
                  src={results.images.noisy_salt_pepper}
                  psnr={results.metrics.psnr_noisy_salt_pepper}
                  dlName="noisy_sp" onExpand={setModal} onDownload={downloadImage} />
                <ImageCard title="Gaussian Filter"
                  src={results.images.filtered_sp_gaussian}
                  psnr={results.metrics.psnr_filtered_sp_gaussian}
                  winner={results.analysis.salt_pepper_noise_winner === 'gaussian_filter'}
                  dlName="filtered_sp_gaussian" onExpand={setModal} onDownload={downloadImage} />
                <ImageCard title="Median Filter"
                  src={results.images.filtered_sp_median}
                  psnr={results.metrics.psnr_filtered_sp_median}
                  winner={results.analysis.salt_pepper_noise_winner === 'median_filter'}
                  dlName="filtered_sp_median" onExpand={setModal} onDownload={downloadImage} />
              </div>
            </div>

            {/* ROW 4 — Edge from Gaussian noise */}
            <div className="result-row">
              <div className="row-header">
                <div className="row-dot" style={{ background:'#8b5cf6' }} />
                <div>
                  <span>Deteksi Tepi ({edgeMethod.toUpperCase()}) — Gaussian Noise</span>
                  <span className="row-sub">Filter yang lebih baik menghasilkan lebih sedikit tepi palsu</span>
                </div>
              </div>
              <div className="img-grid-2">
                <ImageCard title="Tepi dari Gaussian Filter"
                  src={results.images.edge_gauss_filtered_gaussian}
                  edgeCount={results.metrics.edge_count_gauss_gaussian}
                  dlName="edge_gauss_gaussian" onExpand={setModal} onDownload={downloadImage} />
                <ImageCard title="Tepi dari Median Filter"
                  src={results.images.edge_gauss_filtered_median}
                  edgeCount={results.metrics.edge_count_gauss_median}
                  dlName="edge_gauss_median" onExpand={setModal} onDownload={downloadImage} />
              </div>
            </div>

            {/* ROW 5 — Edge from S&P noise */}
            <div className="result-row">
              <div className="row-header">
                <div className="row-dot" style={{ background:'#06b6d4' }} />
                <div>
                  <span>Deteksi Tepi ({edgeMethod.toUpperCase()}) — Salt & Pepper Noise</span>
                  <span className="row-sub">Median filter sangat efektif menghilangkan tepi palsu noise impulsif</span>
                </div>
              </div>
              <div className="img-grid-2">
                <ImageCard title="Tepi dari Gaussian Filter"
                  src={results.images.edge_sp_filtered_gaussian}
                  edgeCount={results.metrics.edge_count_sp_gaussian}
                  dlName="edge_sp_gaussian" onExpand={setModal} onDownload={downloadImage} />
                <ImageCard title="Tepi dari Median Filter"
                  src={results.images.edge_sp_filtered_median}
                  edgeCount={results.metrics.edge_count_sp_median}
                  dlName="edge_sp_median" onExpand={setModal} onDownload={downloadImage} />
              </div>
            </div>

            {/* ── ANALYSIS ─────────────────────────────────────────────────── */}
            <div className="analysis-section fade-up">
              <h2 className="analysis-title">Analisis Hasil</h2>

              <div className="analysis-grid">

                {/* Gaussian */}
                <div className="analysis-card-item">
                  <p className="analysis-card-label">Gaussian Noise</p>
                  <div className="winner-badge">
                    🏆 {results.analysis.gaussian_noise_winner === 'gaussian_filter'
                        ? 'Gaussian Filter' : 'Median Filter'}
                  </div>
                  <div className="metric-row">
                    <div className="metric-box">
                      <p className="metric-name">Gaussian Filter</p>
                      <p className="metric-num">{results.metrics.psnr_filtered_gauss_gaussian} <span>dB</span></p>
                    </div>
                    <div className="metric-box">
                      <p className="metric-name">Median Filter</p>
                      <p className="metric-num">{results.metrics.psnr_filtered_gauss_median} <span>dB</span></p>
                    </div>
                    <div className="metric-box">
                      <p className="metric-name">SSIM</p>
                      <p className="metric-num">{results.metrics.ssim_filtered_gauss_gaussian}</p>
                    </div>
                  </div>
                  <p className="analysis-text">{results.analysis.reasoning_gaussian}</p>
                </div>

                {/* S&P */}
                <div className="analysis-card-item">
                  <p className="analysis-card-label">Salt & Pepper Noise</p>
                  <div className="winner-badge winner-badge-green">
                    🏆 {results.analysis.salt_pepper_noise_winner === 'gaussian_filter'
                        ? 'Gaussian Filter' : 'Median Filter'}
                  </div>
                  <div className="metric-row">
                    <div className="metric-box">
                      <p className="metric-name">Gaussian Filter</p>
                      <p className="metric-num">{results.metrics.psnr_filtered_sp_gaussian} <span>dB</span></p>
                    </div>
                    <div className="metric-box">
                      <p className="metric-name">Median Filter</p>
                      <p className="metric-num">{results.metrics.psnr_filtered_sp_median} <span>dB</span></p>
                    </div>
                    <div className="metric-box">
                      <p className="metric-name">SSIM</p>
                      <p className="metric-num">{results.metrics.ssim_filtered_sp_median}</p>
                    </div>
                  </div>
                  <p className="analysis-text">{results.analysis.reasoning_salt_pepper}</p>
                </div>

                {/* Edge */}
                <div className="analysis-card-item analysis-card-wide">
                  <p className="analysis-card-label">Kinerja Deteksi Tepi</p>
                  <div className="edge-metric-grid">
                    {([
                      ['Gaussian→Gauss',  results.metrics.edge_count_gauss_gaussian,  '#f59e0b'],
                      ['Gaussian→Median', results.metrics.edge_count_gauss_median,    '#f59e0b'],
                      ['S&P→Gauss',       results.metrics.edge_count_sp_gaussian,     '#ef4444'],
                      ['S&P→Median',      results.metrics.edge_count_sp_median,       '#ef4444'],
                    ] as [string, number, string][]).map(([lbl, cnt, clr]) => (
                      <div key={lbl} className="edge-box">
                        <p style={{ fontSize:'.65rem', color:'var(--text-muted)', marginBottom:2 }}>{lbl}</p>
                        <p className="metric-num" style={{ fontSize:'.9rem', color: clr }}>
                          {cnt.toLocaleString()} <span style={{ fontSize:'.65rem', color:'var(--text-muted)' }}>px</span>
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="analysis-text">{results.analysis.edge_performance}</p>
                </div>

              </div>{/* /analysis-grid */}

              {/* Summary */}
              <div className="summary-box">
                <p className="summary-label">Kesimpulan Umum</p>
                <p className="summary-text">{results.analysis.summary}</p>
              </div>
            </div>

          </div>
        )}
      </main>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="site-footer">
        <div className="container">
          <p className="footer-group">Kelompok 5 — Computer Vision · Tugas 1</p>
          <div className="footer-members">
            {['2361020 Venilia','2361021 Vincentius','2361022 Vincentlee',
              '2361023 Rendy','2361024 Felisitas'].map(m => (
              <span key={m}>{m}</span>
            ))}
          </div>
          <p className="footer-stack">Python · NumPy · Pillow · SciPy · Next.js</p>
        </div>
      </footer>
    </>
  );
}
