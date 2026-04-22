import ImageWorkspace from '../components/ImageWorkspace';

export default function Home() {
  const defaultImages = [
    '/landscape.png',
    '/city.png'
  ];

  return (
    <main className="container">
      <header className="mb-12 text-center animate-fade-in pt-6">
        <div className="inline-block px-4 py-1 rounded-full bg-cyan-500 bg-opacity-10 border border-cyan-500 border-opacity-20 text-[10px] font-bold tracking-widest uppercase mb-4 text-cyan-400">
          Computer Vision Class • Project 01
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl mb-6 glow-text leading-tight">Noise, Filtering & Edges</h1>
        <p className="max-w-3xl mx-auto text-sm md:text-base opacity-60 leading-relaxed px-4">
          Eksperimen metode filtering dan deteksi tepi menggunakan implementasi algoritma manual untuk memahami hubungan antara noise dan integritas fitur citra.
        </p>
      </header>

      <ImageWorkspace defaultImageUrls={defaultImages} />

      <section className="mt-20 glass-card p-6 md:p-12 mb-20">
        <h2 className="text-2xl md:text-3xl mb-10 text-center md:text-left">Analisis Akademik</h2>
        <div className="grid md:grid-cols-3 gap-10">
          <div className="space-y-4">
            <h4 className="text-cyan-400 font-bold uppercase tracking-widest text-xs">01. Dampak Noise</h4>
            <p className="text-sm opacity-60 leading-relaxed">
              Noise sebesar 10-30% secara signifikan menurunkan integritas visual citra. 
              Salt & Pepper merusak pixel secara diskrit, sementara Gaussian merusak secara kontinu.
            </p>
          </div>
          <div className="space-y-4">
            <h4 className="text-purple-400 font-bold uppercase tracking-widest text-xs">02. Efisiensi Filter</h4>
            <p className="text-sm opacity-60 leading-relaxed">
              <strong>Median Filter</strong> adalah juara dalam mereduksi noise impulsif. 
              <strong>Mean Filter</strong> lebih baik dalam menghaluskan noise yang terdistribusi normal namun mengorbankan ketajaman tepi.
            </p>
          </div>
          <div className="space-y-4">
            <h4 className="text-yellow-400 font-bold uppercase tracking-widest text-xs">03. Kinerja Tepi</h4>
            <p className="text-sm opacity-60 leading-relaxed">
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
