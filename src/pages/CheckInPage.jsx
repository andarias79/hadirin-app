import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import SignaturePad from 'signature_pad'
import { supabase } from '../lib/supabaseClient'
import { calculateDistanceMeters, formatTanggalIndo, formatWaktu } from '../lib/geoUtils'
import {
  MapPin,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eraser,
  Search,
  Send,
  Building2,
} from 'lucide-react'

export default function CheckInPage() {
  const { slug } = useParams()
  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // Form state
  const [identityNumber, setIdentityNumber] = useState('')
  const [fullName, setFullName] = useState('')
  const [position, setPosition] = useState('')
  const [organization, setOrganization] = useState('')
  const [phone, setPhone] = useState('')
  const [attendanceType, setAttendanceType] = useState('onsite')
  const [lookingUp, setLookingUp] = useState(false)
  const [autofillFound, setAutofillFound] = useState(false)

  // GPS state
  const [userCoords, setUserCoords] = useState(null)
  const [distance, setDistance] = useState(null)
  const [gpsStatus, setGpsStatus] = useState('idle') // idle | loading | success | error

  // Submit & Digital Pass state
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState(null)

  // Signature Pad
  const canvasRef = useRef(null)
  const sigPadRef = useRef(null)

  useEffect(() => {
    fetchEvent()
  }, [slug])

  const fetchEvent = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('slug', slug)
      .single()

    if (error || !data) {
      setErrorMsg('Kegiatan tidak ditemukan atau tautan sudah tidak aktif.')
      setLoading(false)
      return
    }
    setEvent(data)
    if (data.event_mode === 'online') {
      setAttendanceType('online')
    } else {
      setAttendanceType('onsite')
    }
    setLoading(false)
  }

  // Ambil GPS otomatis jika mode onsite
  useEffect(() => {
    if (!event) return
    if (attendanceType === 'onsite' && event.latitude && event.longitude) {
      requestLocation()
    }
  }, [event, attendanceType])

  // Inisialisasi Canvas Tanda Tangan
  useEffect(() => {
    if (!event || receipt) return
    const canvas = canvasRef.current
    if (!canvas) return

    const resizeCanvas = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = canvas.offsetWidth * ratio
      canvas.height = canvas.offsetHeight * ratio
      canvas.getContext('2d').scale(ratio, ratio)
      if (sigPadRef.current) sigPadRef.current.clear()
    }

    sigPadRef.current = new SignaturePad(canvas, {
      minWidth: 1.2,
      maxWidth: 2.8,
      penColor: '#0f172a',
    })
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [event, receipt])

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGpsStatus('error')
      return
    }
    setGpsStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setUserCoords(coords)
        if (event?.latitude && event?.longitude) {
          const dist = calculateDistanceMeters(
            coords.lat,
            coords.lng,
            event.latitude,
            event.longitude
          )
          setDistance(dist)
        }
        setGpsStatus('success')
      },
      () => {
        setGpsStatus('error')
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  }

  const handleLookupParticipant = async () => {
    if (!identityNumber.trim()) return
    setLookingUp(true)
    setAutofillFound(false)
    const { data } = await supabase.rpc('lookup_participant', {
      p_identity: identityNumber.trim(),
    })
    if (data && data.length > 0) {
      setFullName(data[0].full_name || '')
      setPosition(data[0].position || '')
      setOrganization(data[0].organization || '')
      setPhone(data[0].phone || '')
      setAutofillFound(true)
    }
    setLookingUp(false)
  }

  const isOutOfRadius =
    attendanceType === 'onsite' &&
    event?.latitude != null &&
    event?.longitude != null &&
    distance != null &&
    distance > event.radius_meters

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')

    if (attendanceType === 'onsite' && event.latitude && event.longitude) {
      if (gpsStatus !== 'success') {
        setErrorMsg('Lokasi GPS wajib aktif untuk kehadiran luring di lokasi acara.')
        return
      }
      if (isOutOfRadius) {
        setErrorMsg(
          `Posisi Anda berjarak ${distance} meter dari lokasi acara (batas maksimal ${event.radius_meters} meter).`
        )
        return
      }
    }

    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      setErrorMsg('Silakan bubuhkan tanda tangan digital Anda terlebih dahulu.')
      return
    }

    setSubmitting(true)
    try {
      // 1. Unggah tanda tangan ke Supabase Storage
      const dataUrl = sigPadRef.current.toDataURL('image/png')
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const fileName = `${event.id}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.png`

      const { error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(fileName, blob, { contentType: 'image/png' })

      if (uploadError) throw new Error('Gagal mengunggah tanda tangan: ' + uploadError.message)

      const { data: publicUrlData } = supabase.storage
        .from('signatures')
        .getPublicUrl(fileName)

      // 2. Simpan data kehadiran ke database
      const payload = {
        event_id: event.id,
        identity_number: identityNumber.trim(),
        full_name: fullName.trim(),
        position: position.trim() || null,
        organization: organization.trim(),
        phone: phone.trim() || null,
        attendance_type: attendanceType,
        user_lat: userCoords?.lat ?? null,
        user_lng: userCoords?.lng ?? null,
        distance_meters: distance ?? null,
        signature_url: publicUrlData.publicUrl,
      }

      const { data: inserted, error: insertError } = await supabase
        .from('attendances')
        .insert([payload])
        .select()
        .single()

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('Nomor identitas (NIP/NIK) Anda sudah tercatat hadir pada kegiatan ini.')
        }
        throw new Error(insertError.message)
      }

      setReceipt(inserted)
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 text-sm">
        Memuat informasi kegiatan...
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Kegiatan Tidak Ditemukan</h2>
        <p className="text-sm text-slate-500 mt-1 mb-4">{errorMsg}</p>
        <Link to="/" className="px-4 py-2 bg-blue-800 text-white rounded-xl text-sm font-medium">
          Kembali ke Beranda
        </Link>
      </div>
    )
  }

  // Tampilan Bukti Kehadiran (Digital Pass)
  if (receipt) {
    return (
      <div className="min-h-screen bg-slate-100 py-8 px-4 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          <div className="bg-teal-600 p-6 text-white text-center">
            <CheckCircle2 className="w-14 h-14 mx-auto mb-2" />
            <h2 className="text-xl font-bold">Kehadiran Tercatat!</h2>
            <p className="text-xs text-teal-100 mt-1">Tunjukkan bukti ini kepada panitia jika diperlukan</p>
          </div>
          <div className="p-6 space-y-4 text-sm">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-400">Kegiatan</p>
              <p className="font-bold text-slate-900">{event.title}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-400">Nama Peserta</p>
                <p className="font-semibold text-slate-800">{receipt.full_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Identitas</p>
                <p className="font-semibold text-slate-800">{receipt.identity_number}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Waktu Tercatat</p>
                <p className="font-semibold text-slate-800">{formatWaktu(receipt.checked_in_at)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    receipt.status === 'on_time'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {receipt.status === 'on_time' ? 'Tepat Waktu' : 'Terlambat'}
                </span>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3 text-center">
              <p className="text-xs text-slate-400 mb-1">Tanda Tangan Digital</p>
              <img
                src={receipt.signature_url}
                alt="Tanda Tangan"
                className="h-20 mx-auto border border-slate-200 rounded-lg bg-slate-50 px-4"
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {/* Header Kegiatan */}
      <div className="bg-blue-900 text-white px-4 pt-6 pb-10">
        <div className="max-w-lg mx-auto space-y-2">
          <span className="inline-block text-xs font-semibold bg-teal-500/20 text-teal-200 border border-teal-400/30 px-2.5 py-0.5 rounded-full">
            HADIRIN • Daftar Hadir Digital
          </span>
          <h1 className="text-xl font-bold leading-snug">{event.title}</h1>
          {event.organizer && (
            <p className="text-xs text-blue-200 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> {event.organizer}
            </p>
          )}
          <div className="pt-2 flex flex-wrap gap-3 text-xs text-blue-100">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-teal-300" />
              {formatTanggalIndo(event.event_date)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-teal-300" />
              {formatWaktu(event.start_time).slice(0, 5)} – {formatWaktu(event.end_time).slice(0, 5)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-teal-300" />
              {event.location_name}
            </span>
          </div>
        </div>
      </div>

      {/* Kartu Formulir */}
      <div className="max-w-lg mx-auto px-4 -mt-5">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-5 space-y-5 border border-slate-200">
          {/* Pilihan Mode jika Hybrid */}
          {event.event_mode === 'hybrid' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Jenis Kehadiran Anda
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAttendanceType('onsite')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    attendanceType === 'onsite'
                      ? 'bg-blue-800 text-white border-blue-800'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  Luring (Di Lokasi)
                </button>
                <button
                  type="button"
                  onClick={() => setAttendanceType('online')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    attendanceType === 'online'
                      ? 'bg-blue-800 text-white border-blue-800'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  Daring (Online/Zoom)
                </button>
              </div>
            </div>
          )}

          {/* Indikator Validasi GPS */}
          {attendanceType === 'onsite' && event.latitude && event.longitude && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                gpsStatus === 'success' && !isOutOfRadius
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <div>
                <p className="font-semibold">
                  {gpsStatus === 'loading' && 'Mendeteksi lokasi GPS perangkat...'}
                  {gpsStatus === 'error' && 'Izin lokasi GPS belum aktif.'}
                  {gpsStatus === 'success' &&
                    !isOutOfRadius &&
                    `Lokasi terverifikasi (${distance} m dari titik acara)`}
                  {gpsStatus === 'success' &&
                    isOutOfRadius &&
                    `Di luar radius (${distance} m / maks ${event.radius_meters} m)`}
                </p>
              </div>
              <button
                type="button"
                onClick={requestLocation}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Cek Ulang
              </button>
            </div>
          )}

          {/* NIP / NIK + Autofill */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              NIP / NIK / Nomor Identitas <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={identityNumber}
                onChange={(e) => setIdentityNumber(e.target.value)}
                onBlur={handleLookupParticipant}
                placeholder="Masukkan NIP / NIK"
                className="flex-1 px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={handleLookupParticipant}
                disabled={lookingUp}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                {lookingUp ? 'Mencari...' : 'Autofill'}
              </button>
            </div>
            {autofillFound && (
              <p className="text-xs text-teal-700 mt-1">
                Data pegawai ditemukan dan terisi otomatis.
              </p>
            )}
          </div>

          {/* Nama Lengkap */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Lengkap (beserta gelar) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Contoh: dr. Budi Santoso, M.Kes"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Jabatan */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Jabatan
            </label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Contoh: Epidemiolog Kesehatan Ahli Muda"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Instansi / Unit Kerja */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Instansi / Unit Kerja <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="Contoh: BKK Kelas II Merauke"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Nomor HP / WhatsApp */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nomor HP / WhatsApp
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08xxxxxxxxxx"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Kanvas Tanda Tangan Digital */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Tanda Tangan Digital <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => sigPadRef.current?.clear()}
                className="text-xs text-slate-500 hover:text-red-600 inline-flex items-center gap-1 cursor-pointer"
              >
                <Eraser className="w-3.5 h-3.5" /> Hapus Ulang
              </button>
            </div>
            <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 overflow-hidden">
              <canvas
                ref={canvasRef}
                className="w-full h-40 touch-none cursor-crosshair block"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Goreskan tanda tangan di dalam kotak di atas menggunakan jari atau stylus.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || isOutOfRadius}
            className="w-full py-3.5 px-4 bg-blue-800 hover:bg-blue-900 disabled:bg-slate-400 text-white font-semibold rounded-xl shadow-md inline-flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Menyimpan Kehadiran...' : 'Konfirmasi & Kirim Kehadiran'}
          </button>
        </form>
      </div>
    </div>
  )
}