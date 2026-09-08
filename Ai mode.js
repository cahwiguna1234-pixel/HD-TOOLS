/* ai-mode.js
   Tambahan untuk BHYON HD: tombol "Upscale AI Asli (Real-ESRGAN)".
   Cara pakai: taruh file ini di folder yang sama dengan index.html,
   lalu tambahkan baris ini SEBELUM tag </body> di index.html:
     <script src="ai-mode.js"></script>

   Ganti PROXY_URL di bawah sesuai alamat backend kamu setelah deploy ke Vercel.
*/
(function () {
  const PROXY_URL = '/api/upscale'; // otomatis benar kalau di-deploy 1 project yang sama di Vercel

  document.addEventListener('DOMContentLoaded', () => {
    const processBtn = document.getElementById('processBtn');
    if (!processBtn) return;

    // Buat tombol baru + checkbox face enhance, disisipkan setelah tombol lokal
    const wrap = document.createElement('div');
    wrap.style.marginTop = '10px';
    wrap.innerHTML = `
      <button type="button" id="aiProcessBtn" class="process-btn" style="background:linear-gradient(135deg,#37e29a,#1f9f6c);">
        🚀 Upscale AI Asli (Real-ESRGAN)
      </button>
      <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12.5px;color:var(--text-2);">
        <input type="checkbox" id="faceEnhanceChk" />
        Perbaiki wajah (untuk foto orang)
      </label>
    `;
    processBtn.insertAdjacentElement('afterend', wrap);

    const aiBtn = document.getElementById('aiProcessBtn');
    const faceChk = document.getElementById('faceEnhanceChk');

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
      progressFill.style.width = '15%';
      progressLabel.textContent = 'Mengirim gambar ke server AI...';
      aiBtn.disabled = true;

      try {
        // Ubah gambar sumber jadi data URL base64 (dari elemen <img> preview yang sudah ada)
        const dataUrl = await imageElementToDataURL(inputImgEl);

        progressFill.style.width = '35%';
        progressLabel.textContent = 'Memproses dengan Real-ESRGAN (bisa 10-40 detik)...';

        const resp = await fetch(PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: dataUrl,
            scale: 4,
            face_enhance: faceChk.checked,
          }),
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Gagal memproses di server.');

        const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
        progressFill.style.width = '85%';
        progressLabel.textContent = 'Menyusun hasil...';

        await renderAIResult(inputImgEl.src, outputUrl);

        progressFill.style.width = '100%';
        progressLabel.textContent = 'Selesai!';
        document.getElementById('outputTagText').textContent =
          'Diproses AI (Real-ESRGAN) — detail ditambahkan oleh model, bukan sekadar resize';
      } catch (err) {
        console.error(err);
        alert('Gagal: ' + err.message);
      } finally {
        aiBtn.disabled = false;
      }
    });
  });

  function imageElementToDataURL(imgEl) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      // Batasi ukuran upload biar tidak terlalu berat (Real-ESRGAN akan upscale sendiri)
      const MAX = 1600;
      const scale = Math.min(1, MAX / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
      canvas.width = Math.round(imgEl.naturalWidth * scale);
      canvas.height = Math.round(imgEl.naturalHeight * scale);
      canvas.getContext('2d').drawImage(imgEl, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    });
  }

  function renderAIResult(beforeSrc, afterUrl) {
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
        afterImg.src = afterUrl;
        compareBeforeWrap.style.width = '50%';
        compareHandle.style.left = '50%';

        outputEmpty.style.display = 'none';
        outputFrame.style.display = 'block';
        outputTag.style.display = 'flex';
        resolve();
      };
      testImg.onerror = reject;
      testImg.src = afterUrl;
    });
  }
})();