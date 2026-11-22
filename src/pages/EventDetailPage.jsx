import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { formatTanggalIndo, formatWaktu } from '../lib/geoUtils'
import { exportToExcel, exportToOfficialPDF } from '../lib/exportUtils'
import { ArrowLeft, FileText, FileSpreadsheet, Trash2, Search } from 'lucide-react'

export default function EventDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [attendances, setAttendances] = useState([])
  const [search, setSearch] = useState('')
  const [exportingPdf, setExportingPdf] = useState(false)

  useEffect(() => {
    checkAuthAndLoad()

    // Langganan pembaruan Real-Time dari Supabase
    const channel = supabase
      .channel(`event-attendances-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendances', filter: `event_id=eq.${id}` },
        () => {
          fetchAttendances()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id])

  const checkAuthAndLoad = async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      navigate('/admin/login')
      return
    }
    const { data: ev } = await supabase.from('events').select('*').eq('id', id).single()
    setEvent(ev)
    fetchAttendances()
  }

  const fetchAttendances = async () => {
    const { data } = await supabase
      .from('attendances')
      .select('*')
      .eq('event_id', id)
      .order('checked_in_at', { ascending: true })
    setAttendances(data || [])
  }

  const handleDeleteRow = async (attId, name) => {
    if (!confirm(`Hapus catatan kehadiran atas nama ${name}?`)) return
    await supabase.from('attendances').delete().eq('id', attId)
    fetchAttendances()
  }

  const handlePdfExport = async () => {
    if (!event) return
    setExportingPdf(true)
    await exportToOfficialPDF(event, attendances)
    setExportingPdf(false)
  }

  if (!event) {
    return <div className="p-6 text-sm text-slate-500">Memuat rekap kegiatan...</div>
  }

  const onTimeCount = attendances.filter((a) => a.status === 'on_time').length
  const lateCount = attendances.filter((a) => a.status === 'late').length
  const filtered = attendances.filter(
    (a) =>
      a.full_name.toLowerCase().includes(search.toLowerCase()) ||
      a.organization.toLowerCase().includes(search.toLowerCase()) ||
      a.identity_number.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <header className="bg-blue-950 text-white px-4 py-5">
        <div className="max-w-6xl mx-auto space-y-2">
          <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-blue-200 hover:text-white">
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Daftar Kegiatan
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold">{event.title}</h1>
              <p className="text-xs text-blue-200">
                {formatTanggalIndo(event.event_date)} • {event.location_name}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportToExcel(event, attendances)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" /> Ekspor Excel
              </button>
              <button
                onClick={handlePdfExport}
                disabled={exportingPdf}
                className="px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                {exportingPdf ? 'Menyusun PDF...' : 'Unduh PDF Resmi'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Statistik Ringkas Real-Time */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <p className="text-xs text-slate-500">Total Peserta Hadir</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{attendances.length}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <p className="text-xs text-slate-500">Tepat Waktu</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{onTimeCount}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <p className="text-xs text-slate-500">Terlambat</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{lateCount}</p>
          </div>
        </div>

        {/* Tabel Daftar Hadir Live */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h2 className="font-bold text-sm text-slate-800">Log Kehadiran Real-Time</h2>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari nama, NIP, instansi..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="p-3 font-semibold">No</th>
                  <th className="p-3 font-semibold">Nama & Identitas</th>
                  <th className="p-3 font-semibold">Jabatan & Instansi</th>
                  <th className="p-3 font-semibold">Waktu & Jarak</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold text-center">Tanda Tangan</th>
                  <th className="p-3 font-semibold text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      Belum ada peserta yang tercatat hadir.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-500">{idx + 1}</td>
                      <td className="p-3">
                        <p className="font-bold text-slate-900">{item.full_name}</p>
                        <p className="text-slate-500">{item.identity_number}</p>
                      </td>
                      <td className="p-3">
                        <p className="text-slate-800">{item.position || '-'}</p>
                        <p className="text-slate-500">{item.organization}</p>
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-slate-800">{formatWaktu(item.checked_in_at)}</p>
                        <p className="text-slate-400">
                          {item.attendance_type === 'online'
                            ? 'Daring'
                            : item.distance_meters != null
                            ? `${item.distance_meters} m`
                            : 'Luring'}
                        </p>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            item.status === 'on_time'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.status === 'on_time' ? 'Tepat Waktu' : 'Terlambat'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <img
                          src={item.signature_url}
                          alt="TTD"
                          className="h-10 mx-auto border border-slate-200 rounded bg-white px-2"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleDeleteRow(item.id, item.full_name)}
                          className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                          title="Hapus Baris"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}