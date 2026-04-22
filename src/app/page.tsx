import ImageWorkspace from '../components/ImageWorkspace';

export default function Home() {
  const defaultImages = [
    '/landscape.png',
    '/city.png'
  ];

  return (
    <main className="container">
      <header className="mb-16 text-center animate-fade-in">
        <div className="inline-block px-4 py-1 rounded-full bg-white bg-opacity-5 border border-white border-opacity-10 text-xs font-bold tracking-widest uppercase mb-4 text-cyan-400">
          Computer Vision Project 01
        </div>
        <h1 className="text-5xl md:text-7xl mb-6 glow-text">Noise, Filtering & Edges</h1>
        <p className="max-w-2xl mx-auto text-lg opacity-60 leading-relaxed">
          Analisis dan Eksperimen metode filtering dan deteksi tepi menggunakan implementasi algoritma manual pada citra digital.
        </p>
      </header>

      <ImageWorkspace defaultImageUrls={defaultImages} />

      <section className="mt-24 glass-card p-12">
        <h2 className="text-3xl mb-8">Academic Analysis</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="space-y-4">
            <h4 className="text-cyan-400 font-bold">1. Noise Impact</h4>
            <p className="text-sm opacity-70">
              Noise sebesar 10-30% secara signifikan menurunkan integritas visual citra. 
              Salt & Pepper merusak pixel secara diskrit, sementara Gaussian merusak secara kontinu.
            </p>
          </div>
          <div className="space-y-4">
            <h4 className="text-cyan-400 font-bold">2. Filter Efficiency</h4>
            <p className="text-sm opacity-70">
              <strong>Median Filter</strong> adalah juara dalam mereduksi noise impulsif (Salt & Pepper). 
              <strong>Mean Filter</strong> lebih baik dalam menghaluskan noise yang terdistribusi normal namun mengorbankan ketajaman tepi.
            </p>
          </div>
          <div className="space-y-4">
            <h4 className="text-cyan-400 font-bold">3. Edge Performance</h4>
            <p className="text-sm opacity-70">
              Deteksi tepi <strong>Sobel</strong> bekerja maksimal setelah tahap filtering. Tanpa filtering, 
              gradien noise akan terdeteksi sebagai garis tepi palsu, mengaburkan struktur asli objek.
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-24 py-12 border-t border-white border-opacity-5 text-center opacity-40 text-sm">
        <div className="mb-8 flex flex-wrap justify-center gap-x-8 gap-y-2">
          <span>2361020 – VENILIA DINA MINARTI</span>
          <span>2361021 – VINCENTIUS BRYAN KWANDOU</span>
          <span>2361022 – VINCENTLEE EDBERT MARKIONES</span>
          <span>2361023 – RENDY ALFIN MAMINTADA</span>
          <span>2361024 – FELISITAS NATASYA LADY CLAUDIA</span>
        </div>
        <p>&copy; 2026 Kelompok 5 - Computer Vision Class</p>
      </footer>
    </main>
  );
}
