/* ai-server-mode.js — tombol "HD Server Asli".
   Ini yang paling setara dengan Upscayl, karena Upscayl (versi desktop) di balik layar
   juga menjalankan Real-ESRGAN — model AI yang PERSIS sama dengan yang dipanggil di sini
   lewat /api/upscale.js (proxy ke Replicate, model nightmareai/real-esrgan).

   Kenapa perlu tombol terpisah dari "HD Asli (AI, 4x)" yang browser-only?
   - Model di browser (ESRGAN Thick 4x via TensorFlow.js) dibatasi ukuran & kecepatan
     perangkat, jadi kualitasnya sedikit di bawah Real-ESRGAN versi penuh.
   - Model di server (Real-ESRGAN via Replicate) berjalan di GPU sungguhan tanpa batasan
     device pengguna, jadi ini yang paling "setara Upscayl".

   Butuh REPLICATE_API_TOKEN sudah diset di Environment Variables Vercel (lihat upscale.js).
*/
(function () {
  const MAX_INPUT_SIDE = 1440; // rekomendasi resmi model ini: input sampai ~1440p paling stabil

  function limitSizeToDataUrl(imgEl, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
    const w = Math.max(1, Math.round(imgEl.naturalWidth * scale));
    const h = Math.max(1, Math.round(imgEl.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgEl, 0, 0, w, h);
    // PNG dulu (lossless) — kalau file base64-nya kebesaran untuk body limit serverless
    // (~4.5MB di Vercel), baru turun ke JPEG kualitas tinggi supaya tetap terkirim.
    let dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > 4_200_000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    }
    return dataUrl;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.crossOrigin = 'anonymous';
      img.src = src;
    });
  }

  function renderServerResult(beforeSrc, afterSrc) {
    return new Promise((resolve, reject) => {
      const afterImg = document.getElementById('afterImg');
      const beforeImg = document.getElementById('beforeImg');
      const outputCanvas = document.getElementById('outputCanvas');
      const outputEmpty = document.getElementById('outputEmpty');
      const outputFrame = document.getElementById('outputFrame');
      const outputTag = document.getElementById('outputTag');
      const compareBeforeWrap = document.getElementById('compareBeforeWrap');
      const compareHandle = document.getElementById('compareHandle');

      const testImg = new Image();
      testImg.crossOrigin = 'anonymous';
      testImg.onload = () => {
        outputCanvas.width = testImg.naturalWidth;
        outputCanvas.height = testImg.naturalHeight;
        outputCanvas.getContext('2d').drawImage(testImg, 0, 0);

        beforeImg.src = beforeSrc;
        afterImg.src = afterSrc;
        compareBeforeWrap.style.width = '50%';
        compareHandle.style.left = '50%';

        outputEmpty.style.display = 'none';
        outputFrame.style.display = 'block';
        outputTag.style.display = 'flex';
        resolve();
      };
      testImg.onerror = reject;
      testImg.src = afterSrc;
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const processBtn = document.getElementById('processBtn');
    if (!processBtn) return;

    const wrap = document.createElement('div');
    wrap.style.marginTop = '10px';
    wrap.innerHTML = `
      <button type="button" id="serverProcessBtn" class="process-btn" style="background:linear-gradient(135deg,#5b8cff,#2f5bd6);">
        ⚡ HD Server Asli (Real-ESRGAN — setara Upscayl)
      </button>
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2);margin-top:8px;">
        <input type="checkbox" id="serverFaceEnhance" style="accent-color:#5b8cff;" />
        Tingkatkan wajah (GFPGAN) — aktifkan untuk foto orang/potret
      </label>
      <div style="font-size:11.5px;color:var(--text-2);margin-top:6px;">
        Diproses di server GPU (Replicate, model Real-ESRGAN — mesin yang sama persis
        dipakai Upscayl). Butuh koneksi internet dan REPLICATE_API_TOKEN sudah diset.
      </div>
    `;
    processBtn.insertAdjacentElement('afterend', wrap);

    const serverBtn = document.getElementById('serverProcessBtn');

    serverBtn.addEventListener('click', async () => {
      const inputImgEl = document.getElementById('inputImgEl');
      if (!inputImgEl || !inputImgEl.src) {
        alert('Unggah gambar terlebih dahulu.');
        return;
      }

      const progressWrap = document.getElementById('progressWrap');
      const progressFill = document.getElementById('progressFill');
      const progressLabel = document.getElementById('progressLabel');
      const faceEnhance = document.getElementById('serverFaceEnhance').checked;

      progressWrap.classList.add('active');
      serverBtn.disabled = true;

      try {
        progressFill.style.width = '10%';
        progressLabel.textContent = 'Menyiapkan gambar untuk dikirim ke server...';
        const srcImg = await loadImage(inputImgEl.src);
        const imageDataUrl = limitSizeToDataUrl(srcImg, MAX_INPUT_SIDE);

        progressFill.style.width = '25%';
        progressLabel.textContent = 'Mengunggah & memproses di GPU server (Real-ESRGAN)...';

        const resp = await fetch('/api/upscale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: imageDataUrl,
            scale: 4,
            face_enhance: faceEnhance,
          }),
        });

        progressFill.style.width = '85%';
        const result = await resp.json();
        if (!resp.ok) {
          throw new Error(result && result.error ? result.error : `Server error (${resp.status})`);
        }

        const output = Array.isArray(result.output) ? result.output[result.output.length - 1] : result.output;
        if (!output) throw new Error('Server tidak mengembalikan gambar hasil.');

        progressFill.style.width = '95%';
        progressLabel.textContent = 'Menyusun hasil...';
        await renderServerResult(inputImgEl.src, output);

        progressFill.style.width = '100%';
        progressLabel.textContent = 'Selesai!';
        const tag = document.getElementById('outputTagText');
        if (tag) tag.textContent = 'Diproses Real-ESRGAN di server (setara Upscayl)' + (faceEnhance ? ' + GFPGAN face enhance' : '');
      } catch (err) {
        console.error(err);
        alert('Gagal memproses lewat server: ' + err.message + '\n\nCoba gunakan tombol "HD Asli (AI, 4x)" (berjalan langsung di browser, tidak butuh server) sebagai gantinya.');
      } finally {
        serverBtn.disabled = false;
      }
    });
  });
})();
