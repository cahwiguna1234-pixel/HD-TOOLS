// api/upscale.js
// Vercel Serverless Function — proxy aman ke Replicate API (model Real-ESRGAN resmi,
// mesin AI yang sama persis dengan yang dipakai Upscayl).
// Kenapa perlu proxy? Karena REPLICATE_API_TOKEN tidak boleh ditaruh di kode
// frontend (index.html) — kalau ditaruh di sana, siapapun yang buka "View Source"
// bisa mencuri dan memakai kuota/biaya API milikmu.
//
// PERBAIKAN PENTING: versi sebelumnya memanggil POST /v1/predictions dengan sebuah
// "version" hash yang di-pin manual (350d3204...). Replicate sudah menjadikan
// nightmareai/real-esrgan sebagai "official model", dan versi lama yang di-pin itu
// SUDAH DIALIHKAN OTOMATIS ("automatically upgraded") ke versi terbaru oleh Replicate
// sendiri — artinya hash yang di-pin bisa basi kapan saja tanpa pemberitahuan dan
// berisiko bikin request gagal diam-diam. Sekarang kita panggil endpoint resmi model
// TANPA hash sama sekali, sehingga otomatis selalu memakai versi terbaru & tervalidasi:
//   POST https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions
// Ini format resmi Replicate untuk "official models" dan tidak akan basi lagi.

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
    const createResp = await fetch('https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        input: {
          image,
          // Model ini paling stabil di scale 2–4 dan disarankan untuk gambar input hingga ~1440p.
          // Kita clamp di sini supaya request aneh dari client tidak bikin job gagal/timeout.
          scale: Math.min(10, Math.max(1, Number(scale) || 4)),
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
