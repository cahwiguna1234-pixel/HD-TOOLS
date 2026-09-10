/* ai-server-mode.js — mesin AI server (Real-ESRGAN via Replicate), lewat proxy
   /api/upscale (lihat api/upscale.js). Ini mesin paling setara Upscayl karena
   berjalan di GPU sungguhan, tanpa batasan device pengunjung.

   PERBAIKAN PENTING dari versi sebelumnya:
   1) Dulu ini tombol terpisah ("HD Server Asli") yang kalau gagal langsung
      menampilkan alert error ke pengguna. Sekarang file ini HANYA mengekspos
      fungsi (window.BHYON_SERVER.upscale) yang dicoba otomatis lebih dulu oleh
      alur utama di index.html — kalau backend belum di-setup (situs di-hosting
      statis tanpa Vercel, atau REPLICATE_API_TOKEN belum diisi), fungsi ini akan
      melempar error yang DITANGKAP secara diam-diam oleh pemanggilnya, lalu
      otomatis lanjut memakai mesin AI browser sebagai cadangan. Pengunjung situs
      tidak pernah melihat dialog error karena hal ini.
   2) Server tetap butuh REPLICATE_API_TOKEN diset di Environment Variables Vercel
      supaya jalur ini aktif — kalau tidak, sistem otomatis pakai mesin AI browser,
      hasilnya tetap AI beneran, hanya sedikit di bawah kualitas server GPU.
*/
(function () {
  function limitSizeToDataUrl(imgEl, maxSide) {
    const w0 = imgEl.naturalWidth || imgEl.width, h0 = imgEl.naturalHeight || imgEl.height;
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgEl, 0, 0, w, h);
    // PNG dulu (lossless) — kalau base64-nya kebesaran untuk body limit serverless
    // (~4.5MB di Vercel), baru turun ke JPEG kualitas tinggi supaya tetap terkirim.
    let dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > 4_200_000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    }
    return dataUrl;
  }

  function urlToCanvas(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c);
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  /**
   * @param {HTMLImageElement} imgEl
   * @param {Object} opts
   * @param {number} [opts.maxSide=1440] - rekomendasi resmi model Real-ESRGAN
   * @param {number} [opts.scale=4]
   * @param {boolean} [opts.faceEnhance=false]
   * @param {(rate:number)=>void} [opts.onProgress]
   * @returns {Promise<HTMLCanvasElement>}
   */
  async function upscale(imgEl, opts) {
    opts = opts || {};
    const maxSide = opts.maxSide || 1440;
    const scale = opts.scale || 4;
    const faceEnhance = !!opts.faceEnhance;
    const onProgress = opts.onProgress || function () {};

    const imageDataUrl = limitSizeToDataUrl(imgEl, maxSide);
    onProgress(0.15);

    let resp;
    try {
      resp = await fetch('/api/upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageDataUrl, scale, face_enhance: faceEnhance }),
      });
    } catch (networkErr) {
      throw new Error('Endpoint server AI tidak dapat dihubungi (kemungkinan hosting statis tanpa backend).');
    }

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      // Bukan respons JSON = endpoint tidak ada di hosting ini (mis. 404 HTML default).
      throw new Error('Endpoint /api/upscale tidak tersedia di hosting ini.');
    }

    const result = await resp.json();
    if (!resp.ok) {
      throw new Error(result && result.error ? result.error : `Server error (${resp.status})`);
    }

    const output = Array.isArray(result.output) ? result.output[result.output.length - 1] : result.output;
    if (!output) throw new Error('Server tidak mengembalikan gambar hasil.');

    onProgress(0.95);
    const canvas = await urlToCanvas(output);
    onProgress(1);
    return canvas;
  }

  window.BHYON_SERVER = { upscale };
})();
