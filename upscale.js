// api/upscale.js
// Vercel Serverless Function — proxy aman ke Replicate API (model Real-ESRGAN,
// mesin AI yang sama persis dengan yang dipakai Upscayl).
// Kenapa perlu proxy? Karena REPLICATE_API_TOKEN tidak boleh ditaruh di kode
// frontend (index.html) — kalau ditaruh di sana, siapapun yang buka "View Source"
// bisa mencuri dan memakai kuota/biaya API milikmu.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'REPLICATE_API_TOKEN belum diset di Environment Variables Vercel.' });
  }

  const { image, scale = 4, face_enhance = false } = req.body || {};
  if (!image) {
    return res.status(400).json({ error: 'Field "image" (data URL base64) wajib diisi.' });
  }

  try {
    const createResp = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        // PENTING: version hash di bawah ini sebelumnya rusak (kurang 1 karakter di bagian akhir),
        // sehingga Replicate selalu menolak request ini dengan error "version not found" dan
        // tombol "HD Server Asli" (mesin Real-ESRGAN — persis yang dipakai Upscayl) tidak pernah
        // benar-benar jalan. Hash di bawah ini sudah diverifikasi 64 karakter & valid.
        version: '350d32041630ffbe63c8352783a26d94126809164e54085352f8326e53999085', // nightmareai/real-esrgan
        input: {
          image,
          // Model ini paling stabil di scale 2–4 dan disarankan untuk gambar input hingga ~1440p.
          // Kita clamp di sini supaya request aneh dari client tidak bikin job gagal/timeout.
          scale: Math.min(4, Math.max(1, Number(scale) || 4)),
          face_enhance: Boolean(face_enhance),
        },
      }),
    });

    const created = await createResp.json();
    if (!createResp.ok) {
      return res.status(createResp.status).json({ error: created?.detail || 'Gagal membuat prediction di Replicate.' });
    }

    if (created.status === 'succeeded') {
      return res.status(200).json({ output: created.output });
    }

    let prediction = created;
    // Gambar besar + scale 4x bisa butuh lebih dari 60 detik di GPU antrian Replicate,
    // jadi polling dinaikkan ke ~2 menit sebelum benar-benar dianggap timeout.
    for (let i = 0; i < 80; i++) {
      if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') break;
      await new Promise((r) => setTimeout(r, 1500));
      const pollResp = await fetch(`https://api.replicate.com/v1/predictions/${created.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      prediction = await pollResp.json();
    }

    if (prediction.status === 'failed') {
      return res.status(502).json({ error: `Replicate gagal memproses gambar ini: ${prediction.error || 'alasan tidak diketahui'}.` });
    }
    if (prediction.status !== 'succeeded') {
      return res.status(504).json({ error: `Proses masih berjalan setelah 2 menit (status: ${prediction.status}). Coba gambar yang lebih kecil.` });
    }

    return res.status(200).json({ output: prediction.output });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Kesalahan server saat menghubungi Replicate.' });
  }
}
