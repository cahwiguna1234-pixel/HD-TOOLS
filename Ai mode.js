/* ai-mode.js — versi SIMPLE, 100% jalan di browser, tanpa server/akun/API key.
   Pakai UpscalerJS (model AI ESRGAN via TensorFlow.js) yang dimuat lewat CDN
   di index.html. Detail gambar benar-benar ditambah oleh neural network,
   bukan sekadar resize + sharpen.

   Cara pakai: cukup taruh file ini satu folder dengan index.html, sudah otomatis
   terpanggil karena index.html sudah berisi <script src="ai-mode.js"></script>.
   Tidak perlu langkah lain — buka index.html di browser, selesai.
*/
(function () {
  let upscalerInstance = null;
  function getUpscaler() {
    if (!upscalerInstance) {
      upscalerInstance = new Upscaler({ model: DefaultUpscalerJSModel });
    }
    return upscalerInstance;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const processBtn = document.getElementById('processBtn');
    if (!processBtn) return;

    const wrap = document.createElement('div');
    wrap.style.marginTop = '10px';
    wrap.innerHTML = `
      <button type="button" id="aiProcessBtn" class="process-btn" style="background:linear-gradient(135deg,#37e29a,#1f9f6c);">
        🚀 HD Asli (AI, 4x) — sekali klik
      </button>
      <div style="font-size:11.5px;color:var(--text-2);margin-top:6px;">
        Proses AI berjalan langsung di browser kamu. Pertama kali dipakai butuh
        beberapa detik untuk mengunduh model (±3-5MB), setelah itu lebih cepat.
      </div>
    `;
    processBtn.insertAdjacentElement('afterend', wrap);

    const aiBtn = document.getElementById('aiProcessBtn');

    aiBtn.addEventListener('click', async () => {
      const inputImgEl = document.getElementById('inputImgEl');
      if (!inputImgEl || !inputImgEl.src) {
        alert('Unggah gambar terlebih dahulu.');
        return;
      }

      const progressWrap = document.getElementById('progressWrap');
      const progressFill = document.getElementById('progressFill');
      const progressLabel = document.getElementById('progressLabel');
      progressWrap.classList.add('active');
      aiBtn.disabled = true;

      try {
        progressFill.style.width = '10%';
        progressLabel.textContent = 'Menyiapkan model AI (pertama kali agak lama)...';

        const upscaler = getUpscaler();

        // Batasi ukuran input dulu biar tidak terlalu berat untuk browser
        const safeSrc = await limitSize(inputImgEl, 1000);

        // Pass 1: AI upscale 2x (detail asli ditambah oleh model)
        progressFill.style.width = '35%';
        progressLabel.textContent = 'AI menambah detail (langkah 1/2)...';
        const pass1 = await upscaler.upscale(safeSrc);

        // Pass 2: AI upscale 2x lagi dari hasil pass 1 → total kira-kira 4x
        progressFill.style.width = '70%';
        progressLabel.textContent = 'AI menambah detail (langkah 2/2, menuju 4x)...';
        const pass1Img = await loadImage(pass1);
        const pass2 = await upscaler.upscale(pass1Img);

        progressFill.style.width = '90%';
        progressLabel.textContent = 'Menyusun hasil...';
        await renderAIResult(inputImgEl.src, pass2);

        progressFill.style.width = '100%';
        progressLabel.textContent = 'Selesai!';
        const tag = document.getElementById('outputTagText');
        if (tag) tag.textContent = 'Diproses AI (ESRGAN, 4x) — detail ditambahkan model, bukan sekadar resize';
      } catch (err) {
        console.error(err);
        alert('Gagal memproses: ' + err.message + '\n\nCoba pakai gambar yang lebih kecil, atau pastikan koneksi internet stabil (model perlu diunduh sekali).');
      } finally {
        aiBtn.disabled = false;
      }
    });
  });

  function limitSize(imgEl, maxSide) {
    return new Promise((resolve) => {
      const scale = Math.min(1, maxSide / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
      if (scale === 1) { resolve(imgEl); return; }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(imgEl.naturalWidth * scale);
      canvas.height = Math.round(imgEl.naturalHeight * scale);
      canvas.getContext('2d').drawImage(imgEl, 0, 0, canvas.width, canvas.height);
      const out = new Image();
      out.onload = () => resolve(out);
      out.src = canvas.toDataURL('image/png');
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function renderAIResult(beforeSrc, afterDataUrl) {
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
      testImg.onload = () => {
        outputCanvas.width = testImg.naturalWidth;
        outputCanvas.height = testImg.naturalHeight;
        outputCanvas.getContext('2d').drawImage(testImg, 0, 0);

        beforeImg.src = beforeSrc;
        afterImg.src = afterDataUrl;
        compareBeforeWrap.style.width = '50%';
        compareHandle.style.left = '50%';

        outputEmpty.style.display = 'none';
        outputFrame.style.display = 'block';
        outputTag.style.display = 'flex';
        resolve();
      };
      testImg.onerror = reject;
      testImg.src = afterDataUrl;
    });
  }
})();
