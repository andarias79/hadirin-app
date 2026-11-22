import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { QrCode, Camera, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react'

export default function HomePage() {
  const [slugInput, setSlugInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const scannerRef = useRef(null)
  const navigate = useNavigate()

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch {
        // Abaikan galat saat menutup kamera
      }
      scannerRef.current = null
    }
    setScanning(false)
  }

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  const startScanner = async () => {
    setScanError('')
    setScanning(true)
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode('qr-reader')
        scannerRef.current = html5QrCode
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            stopScanner()
            if (decodedText.includes('/absen/')) {
              const extractedSlug = decodedText.split('/absen/')[1].split(/[?#]/)[0]
              navigate(`/absen/${extractedSlug}`)
            } else {
              navigate(`/absen/${decodedText.trim()}`)
            }
          }
        )
      } catch {
        setScanError('Kamera tidak dapat diakses. Pastikan izin kamera aktif atau masukkan kode kegiatan secara manual.')
        setScanning(false)
      }
    }, 150)
  }

  const handleManualSubmit = (e) => {
    e.preventDefault()
    if (!slugInput.trim()) return
    const cleanSlug = slugInput.includes('/absen/')
      ? slugInput.split('/absen/')[1].trim()
      : slugInput.trim()
    navigate(`/absen/${cleanSlug}`)
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900 text-white">
      <header className="max-w-5xl w-full mx-auto px-4 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-teal-500 p-2 rounded-xl">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight leading-none">HADIRIN</h1>
            <p className="text-xs text-blue-200 mt-0.5">Absensi Digital Kegiatan</p>
          </div>
        </div>
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 px-3.5 py-2 rounded-lg transition"
        >
          <ShieldCheck className="w-4 h-4 text-teal-300" />
          Portal Panitia
        </Link>
      </header>

      <main className="max-w-md w-full mx-auto px-4 my-auto py-8">
        <div className="bg-white text-slate-800 rounded-2xl shadow-2xl p-6 space-y-6">
          <div className="text-center space-y-1.5">
            <div className="w-12 h-12 bg-blue-50 text-blue-800 rounded-2xl flex items-center justify-center mx-auto mb-2">
              <QrCode className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Registrasi Kehadiran</h2>
            <p className="text-sm text-slate-500">
              Pindai QR Code acara di layar atau masukkan kode kegiatan dari panitia.
            </p>
          </div>

          {!scanning ? (
            <button
              onClick={startScanner}
              className="w-full py-3.5 px-4 bg-blue-800 hover:bg-blue-900 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
            >
              <Camera className="w-5 h-5" />
              Pindai QR Code Kegiatan
            </button>
          ) : (
            <div className="space-y-3">
              <div id="qr-reader" className="w-full rounded-xl overflow-hidden border border-slate-200" />
              <button
                onClick={stopScanner}
                className="w-full py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-medium rounded-xl"
              >
                Tutup Kamera
              </button>
            </div>
          )}

          {scanError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">
              {scanError}
            </p>
          )}

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-xs text-slate-400 uppercase">atau kode kegiatan</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Contoh: rapat-evaluasi-nov"
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value)}
              className="flex-1 px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium text-sm inline-flex items-center gap-1 cursor-pointer"
            >
              Buka <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>

      <footer className="text-center text-xs text-blue-200/70 py-4">
        HADIRIN — Satu Platform untuk Setiap Kehadiran Acara
      </footer>
    </div>
  )
}