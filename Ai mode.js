/* ai-mode.js — mesin AI utama: ESRGAN Thick 4x lewat TensorFlow.js + UpscalerJS,
   jalan 100% di browser (tanpa server/akun/API key).

   PERBAIKAN PENTING dari versi sebelumnya:
   1) Dulu ada tombol AI terpisah yang jarang disadari orang, sementara tombol utama
      "Proses ke HD" cuma menjalankan resize+sharpen klasik (bukan AI) — makanya hasil
      terasa "gimmick", karena mesin AI yang beneran hampir tidak pernah kepakai.
      Sekarang file ini HANYA mengekspos fungsi (window.BHYON_AI.upscaleTiled) yang
      dipanggil otomatis oleh alur utama di index.html, jadi AI selalu ikut jalan.
   2) Dulu gambar input dipaksa diperkecil ke maksimum 1024px SEBELUM di-AI-kan.
      Itu justru membuang detail asli sebelum diproses, sehingga hasil 4x-nya cuma
      "memperbesar versi buram" — bukan menambah ketajaman nyata. Model ini berjalan
      tiled (patchSize/padding), jadi ukuran input bisa jauh lebih besar tanpa membebani
      memori device secara berlebihan. Cap sekarang dinaikkan signifikan.
   3) padding tile dinaikkan sedikit untuk margin ekstra terhadap artefak sambungan
      antar-tile ("seam") saat di-zoom.
*/
(function () {
  let upscalerInstance = null;
  let currentBackend = null;

  function getUpscaler() {
    if (typeof Upscaler === 'undefined' || typeof ESRGANThick4x === 'undefined') {
      throw new Error('Library AI (UpscalerJS/ESRGAN) belum termuat di halaman ini.');
    }
    if (!upscalerInstance) {
      upscalerInstance = new Upscaler({ model: ESRGANThick4x });
    }
    return upscalerInstance;
  }

  async function ensureBackend(name) {
    if (typeof tf === 'undefined') {
      throw new Error('TensorFlow.js belum termuat di halaman ini.');
    }
    if (currentBackend === name) return;
    await tf.setBackend(name);
    await tf.ready();
    currentBackend = name;
    upscalerInstance = null; // model perlu dibuat ulang kalau backend berganti
  }

  function isShaderOrGpuError(err) {
    const msg = (err && err.message ? err.message : String(err)).toLowerCase();
    return msg.includes('shader') || msg.includes('webgl') || msg.includes('gpu') ||
           msg.includes('context') || msg.includes('memory') || msg.includes('texture');
  }

  // Perkecil HANYA kalau memang lebih besar dari cap. Cap jauh lebih longgar dari
  // versi lama (1024px) karena pemrosesan sudah tiled, bukan sekali proses utuh.
  function limitSize(imgEl, maxSide) {
    return new Promise((resolve) => {
      const longest = Math.max(imgEl.naturalWidth || imgEl.width, imgEl.naturalHeight || imgEl.height);
      const scale = Math.min(1, maxSide / longest);
      if (scale === 1) { resolve(imgEl); return; }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round((imgEl.naturalWidth || imgEl.width) * scale);
      canvas.height = Math.round((imgEl.naturalHeight || imgEl.height) * scale);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
      const out = new Image();
      out.onload = () => resolve(out);
      out.onerror = () => resolve(imgEl);
      out.src = canvas.toDataURL('image/png');
    });
  }

  function dataUrlToCanvas(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /**
   * Upscale 4x asli (satu pass, model ESRGAN Thick) dengan tiling otomatis.
   * @param {HTMLImageElement} imgEl - gambar sumber
   * @param {Object} opts
   * @param {number} [opts.maxSide=2200] - batas sisi terpanjang SEBELUM di-AI-kan
   * @param {number} [opts.patchSize=64]
   * @param {number} [opts.padding=6]
   * @param {(rate:number)=>void} [opts.onProgress]
   * @returns {Promise<HTMLCanvasElement>}
   */
  async function upscaleTiled(imgEl, opts) {
    opts = opts || {};
    const maxSide = opts.maxSide || 2200;
    const patchSize = opts.patchSize || 64;
    const padding = opts.padding != null ? opts.padding : 6;
    const onProgress = opts.onProgress || function () {};

    const safeSrc = await limitSize(imgEl, maxSide);

    async function runOnce() {
      const upscaler = getUpscaler();
      return upscaler.upscale(safeSrc, {
        patchSize,
        padding,
        progress: (rate) => onProgress(rate),
      });
    }

    await ensureBackend('webgl');
    let resultDataUrl;
    try {
      resultDataUrl = await runOnce();
    } catch (err) {
      // Sebagian device gagal compile shader WebGL — otomatis coba mode CPU.
      if (isShaderOrGpuError(err) && currentBackend !== 'cpu') {
        console.warn('AI browser: WebGL gagal, mencoba mode CPU.', err);
        await ensureBackend('cpu');
        resultDataUrl = await runOnce();
      } else {
        throw err;
      }
    }
    return dataUrlToCanvas(resultDataUrl);
  }

  window.BHYON_AI = { upscaleTiled };
})();
