import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../lib/supabaseClient'
import { formatTanggalIndo, formatWaktu } from '../lib/geoUtils'
import {
  Plus,
  QrCode,
  Users,
  LogOut,
  MapPin,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  UserPlus,
} from 'lucide-react'

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  // Modal buat kegiatan
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [organizer, setOrganizer] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [lateThreshold, setLateThreshold] = useState(15)
  const [locationName, setLocationName] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [radiusMeters, setRadiusMeters] = useState(100)
  const [eventMode, setEventMode] = useState('onsite')
  const [saving, setSaving] = useState(false)

  // Modal QR Code Presenter
  const [qrEvent, setQrEvent] = useState(null)
  const [copied, setCopied] = useState(false)

  // Modal Tambah Master Pegawai
  const [showPegawaiModal, setShowPegawaiModal] = useState(false)
  const [pegawaiNip, setPegawaiNip] = useState('')
  const [pegawaiNama, setPegawaiNama] = useState('')
  const [pegawaiJabatan, setPegawaiJabatan] = useState('')
  const [pegawaiUnit, setPegawaiUnit] = useState('')

  useEffect(() => {
    checkAuthAndFetch()
  }, [])

  const checkAuthAndFetch = async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      navigate('/admin/login')
      return
    }
    fetchEvents()
  }

  const fetchEvents = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('events')
      .select('*, attendances(count)')
      .order('created_at', { ascending: false })
    setEvents(data || [])
    setLoading(false)
  }

  const sanitizeSlug = (val) => {
    const withoutOrigin = val.includes('/absen/') ? val.split('/absen/').pop() : val
    return withoutOrigin
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)/g, '')
  }

  const handleTitleChange = (val) => {
    setTitle(val)
    setSlug(sanitizeSlug(val))
  }

  const handleUseCurrentGPS = () => {
    if (!navigator.geolocation) return alert('Browser tidak mendukung GPS.')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6))
        setLongitude(pos.coords.longitude.toFixed(6))
      },
      () => alert('Gagal mengambil titik GPS. Pastikan izin lokasi aktif.'),
      { enableHighAccuracy: true }
    )
  }

  const handleCreateEvent = async (e) => {
    e.preventDefault()
    const cleanSlug = sanitizeSlug(slug)
    if (!cleanSlug) {
      alert('Kode URL (Slug) tidak valid. Gunakan huruf kecil, angka, atau tanda hubung (-).')
      return
    }
    setSaving(true)

    const payload = {
      title,
      slug: cleanSlug,
      organizer: organizer || null,
      event_date: eventDate,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      late_threshold_mins: Number(lateThreshold),
      location_name: locationName,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      radius_meters: Number(radiusMeters),
      event_mode: eventMode,
      is_active: true,
    }

    const { error } = await supabase.from('events').insert([payload])
    setSaving(false)
    if (error) {
      alert('Gagal membuat kegiatan: ' + error.message)
      return
    }
    setShowCreateModal(false)
    setTitle('')
    setSlug('')
    fetchEvents()
  }

  const handleDeleteEvent = async (id, eventTitle) => {
    if (!confirm(`Hapus kegiatan "${eventTitle}" beserta seluruh data kehadirannya?`)) return
    await supabase.from('events').delete().eq('id', id)
    fetchEvents()
  }

  const handleSavePegawai = async (e) => {
    e.preventDefault()
    const { error } = await supabase.from('participants').upsert(
      [
        {
          identity_number: pegawaiNip.trim(),
          full_name: pegawaiNama.trim(),
          position: pegawaiJabatan.trim() || null,
          organization: pegawaiUnit.trim() || null,
        },
      ],
      { onConflict: 'identity_number' }
    )
    if (error) {
      alert('Gagal menyimpan data pegawai: ' + error.message)
      return
    }
    alert('Data master peserta berhasil disimpan untuk fitur Autofill!')
    setPegawaiNip('')
    setPegawaiNama('')
    setPegawaiJabatan('')
    setShowPegawaiModal(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  const getEventUrl = (eventSlug) => `${window.location.origin}/absen/${eventSlug}`

  const handleCopyLink = (url) => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Top Navbar */}
      <header className="bg-blue-950 text-white px-4 py-4 shadow">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-lg">HADIRIN — Dasbor Pengelola</h1>
            <p className="text-xs text-blue-200">Manajemen Multi-Kegiatan & Rekap Kehadiran</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPegawaiModal(true)}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-teal-300" /> Master Pegawai
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Buat Kegiatan
            </button>
            <button
              onClick={handleLogout}
              className="p-2 bg-white/10 hover:bg-red-600 rounded-xl text-xs cursor-pointer"
              title="Keluar"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Daftar Kegiatan */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <p className="text-sm text-slate-500">Memuat daftar kegiatan...</p>
        ) : events.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center border border-slate-200">
            <p className="text-slate-600 font-medium mb-3">Belum ada jadwal kegiatan yang dibuat.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2.5 bg-blue-800 text-white rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Buat Kegiatan Pertama
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((ev) => {
              const totalHadir = ev.attendances?.[0]?.count ?? 0
              return (
                <div
                  key={ev.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800">
                        {ev.event_mode}
                      </span>
                      <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full">
                        {totalHadir} Hadir
                      </span>
                    </div>
                    <h2 className="font-bold text-slate-900 line-clamp-2">{ev.title}</h2>
                    <p className="text-xs text-slate-500">{formatTanggalIndo(ev.event_date)}</p>
                    <p className="text-xs text-slate-500">
                      Jam: {formatWaktu(ev.start_time).slice(0, 5)} – {formatWaktu(ev.end_time).slice(0, 5)}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{ev.location_name}</span>
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setQrEvent(ev)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4 text-blue-800" /> QR Code
                    </button>
                    <Link
                      to={`/admin/event/${ev.id}`}
                      className="px-3 py-2 bg-blue-800 hover:bg-blue-900 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Users className="w-4 h-4" /> Rekap & Ekspor
                    </Link>
                    <button
                      onClick={() => handleDeleteEvent(ev.id, ev.title)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-xl cursor-pointer"
                      title="Hapus Kegiatan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Modal QR Code Presenter */}
      {qrEvent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-center space-y-4">
            <h3 className="font-bold text-lg text-slate-900">{qrEvent.title}</h3>
            <p className="text-xs text-slate-500">
              Pindai QR Code ini untuk mengisi daftar hadir kegiatan
            </p>
            <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl inline-block">
              <QRCodeCanvas value={getEventUrl(qrEvent.slug)} size={230} level="H" />
            </div>
            <div className="flex items-center gap-2 bg-slate-100 p-2.5 rounded-xl text-xs">
              <input
                type="text"
                readOnly
                value={getEventUrl(qrEvent.slug)}
                className="bg-transparent flex-1 text-slate-700 outline-none"
              />
              <button
                onClick={() => handleCopyLink(getEventUrl(qrEvent.slug))}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Tersalin' : 'Salin'}
              </button>
              <a
                href={getEventUrl(qrEvent.slug)}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 bg-blue-800 text-white rounded-lg"
                title="Buka Halaman Absen"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <button
              onClick={() => setQrEvent(null)}
              className="w-full py-2.5 bg-slate-800 text-white rounded-xl text-sm font-semibold cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Modal Buat Kegiatan Baru */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <form
            onSubmit={handleCreateEvent}
            className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 my-8"
          >
            <h3 className="font-bold text-lg text-slate-900">Buat Kegiatan Baru</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Kegiatan *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Contoh: Rapat Koordinasi Evaluasi Kinerja"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kode URL (Slug) *</label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) =>
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, '-')
                        .replace(/-+/g, '-')
                    )
                  }
                  placeholder="rapat-tracing-tb"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Penyelenggara</label>
                <input
                  type="text"
                  value={organizer}
                  onChange={(e) => setOrganizer(e.target.value)}
                  placeholder="Subbagian Administrasi Umum"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tanggal *</label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Buka Absen *</label>
                <input
                  type="datetime-local"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tutup Absen *</label>
                <input
                  type="datetime-local"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mode Kehadiran</label>
                <select
                  value={eventMode}
                  onChange={(e) => setEventMode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                >
                  <option value="onsite">Luring / Onsite (Wajib GPS)</option>
                  <option value="online">Daring / Online (Tanpa GPS)</option>
                  <option value="hybrid">Hybrid (Luring & Daring)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Toleransi Terlambat (Menit)</label>
                <input
                  type="number"
                  value={lateThreshold}
                  onChange={(e) => setLateThreshold(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lokasi / Ruang *</label>
              <input
                type="text"
                required
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Aula Kantor / Zoom Meeting"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            {eventMode !== 'online' && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Koordinat Geofencing GPS</span>
                  <button
                    type="button"
                    onClick={handleUseCurrentGPS}
                    className="text-xs text-blue-800 font-semibold underline cursor-pointer"
                  >
                    Gunakan Lokasi Saya Saat Ini
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Latitude"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Longitude"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    type="number"
                    placeholder="Radius (m)"
                    value={radiusMeters}
                    onChange={(e) => setRadiusMeters(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-800 text-white rounded-xl text-sm font-semibold cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Terbitkan Kegiatan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Tambah Master Pegawai */}
      {showPegawaiModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSavePegawai} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3.5">
            <h3 className="font-bold text-lg text-slate-900">Tambah Master Peserta (Autofill)</h3>
            <p className="text-xs text-slate-500">
              Data yang disimpan di sini akan otomatis muncul saat peserta mengetikkan NIP/NIK.
            </p>
            <input
              type="text"
              required
              placeholder="NIP / NIK *"
              value={pegawaiNip}
              onChange={(e) => setPegawaiNip(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
            />
            <input
              type="text"
              required
              placeholder="Nama Lengkap beserta gelar *"
              value={pegawaiNama}
              onChange={(e) => setPegawaiNama(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
            />
            <input
              type="text"
              placeholder="Jabatan"
              value={pegawaiJabatan}
              onChange={(e) => setPegawaiJabatan(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
            />
            <input
              type="text"
              placeholder="Unit Kerja / Instansi"
              value={pegawaiUnit}
              onChange={(e) => setPegawaiUnit(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPegawaiModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold cursor-pointer"
              >
                Simpan Pegawai
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}