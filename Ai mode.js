/* ai-mode.js — versi SIMPLE, 100% jalan di browser, tanpa server/akun/API key.
   Pakai UpscalerJS (model AI ESRGAN "Thick" 4x via TensorFlow.js) yang dimuat lewat CDN
   di index.html. Detail gambar benar-benar ditambah oleh neural network dalam SATU kali
   pass 4x asli — bukan dua kali pass 2x yang dirantai (cara lama), karena merantai dua
   pass GAN saling menumpuk halusinasi detail satu sama lain dan itulah yang bikin hasil
   "pecah"/bertekstur aneh saat di-zoom. Satu model 4x asli jauh lebih bersih dan stabil.

   Cara pakai: cukup taruh file ini satu folder dengan index.html, sudah otomatis
   terpanggil karena index.html sudah berisi <script src="ai-mode.js"></script>.
   Tidak perlu langkah lain — buka index.html di browser, selesai.
*/
(function () {
  let upscalerInstance = null;
  let currentBackend = null;

  function getUpscaler() {
    if (!upscalerInstance) {
      // ESRGANThick4x diekspos secara global oleh script CDN esrgan-thick/4x.min.js
      upscalerInstance = new Upscaler({ model: ESRGANThick4x });
    }
    return upscalerInstance;
  }

  async function ensureBackend(name) {
    if (currentBackend === name) return;
    await tf.setBackend(name);
    await tf.ready();
    currentBackend = name;
    upscalerInstance = null; // model perlu dibuat ulang kalau backend berganti
  }

  function isShaderOrGpuError(err) {
    const msg = (err && err.message ? err.message : String(err)).toLowerCase();
    return msg.includes('shader') || msg.includes('webgl') || msg.includes('gpu') || msg.includes('context') || msg.includes('memory');
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
        Proses AI berjalan langsung di browser kamu, satu kali pass model 4x (bukan 2x dua kali)
        supaya hasil lebih halus dan tidak pecah saat di-zoom. Pertama kali dipakai butuh
        beberapa detik untuk mengunduh model (±4-6MB), setelah itu lebih cepat.
      </div>
    `;
    processBtn.insertAdjacentElement('afterend', wrap);

    const aiBtn = document.getElementById('aiProcessBtn');

    async function runPipeline(progressFill, progressLabel, inputImgEl) {
      const upscaler = getUpscaler();

      // Batasi ukuran input dulu biar tidak terlalu berat untuk browser.
      // Karena sekarang cuma SATU pass (bukan dua), ini juga yang membuat hasil akhir
      // tidak "kehilangan" warna asli — tidak ada bolak-balik encode PNG antar-pass lagi.
      const safeSrc = await limitSize(inputImgEl, 1024);

      progressFill.style.width = '25%';
      progressLabel.textContent = 'AI menambah detail (model 4x, satu pass)...';
      const resultDataUrl = await upscaler.upscale(safeSrc, {
        patchSize: 64,
        padding: 4,
        progress: (rate) => {
          progressFill.style.width = (25 + rate * 60) + '%';
        },
      });

      progressFill.style.width = '90%';
      progressLabel.textContent = 'Menyusun hasil...';
      await renderAIResult(inputImgEl.src, resultDataUrl);
    }

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
        await ensureBackend('webgl');

        try {
          await runPipeline(progressFill, progressLabel, inputImgEl);
        } catch (err) {
          // GPU/browser sebagian device gagal compile shader WebGL — otomatis coba mode CPU
          if (isShaderOrGpuError(err) && currentBackend !== 'cpu') {
            console.warn('WebGL gagal, mencoba mode CPU:', err);
            progressLabel.textContent = 'GPU tidak kompatibel, mencoba mode CPU (lebih lambat)...';
            await ensureBackend('cpu');
            await runPipeline(progressFill, progressLabel, inputImgEl);
          } else {
            throw err;
          }
        }

        progressFill.style.width = '100%';
        progressLabel.textContent = 'Selesai!';
        const tag = document.getElementById('outputTagText');
        if (tag) tag.textContent = 'Diproses AI (ESRGAN Thick, 4x satu-pass) — detail ditambahkan model, warna asli dipertahankan';
      } catch (err) {
        console.error(err);
        alert('Gagal memproses di device ini (sudah dicoba mode GPU dan CPU): ' + err.message + '\n\nCoba pakai gambar yang lebih kecil, browser lain (Chrome disarankan), atau gunakan tombol "HD Server Asli" sebagai gantinya.');
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
      // 'high' quality smoothing di sini penting: downscale yang buruk sebelum masuk
      // ke model AI akan ikut merusak warna/detail hasil akhirnya.
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
      const out = new Image();
      out.onload = () => resolve(out);
      out.src = canvas.toDataURL('image/png'); // PNG = lossless, tidak ada kompresi yang menggeser warna
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
