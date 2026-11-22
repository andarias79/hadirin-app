import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatTanggalIndo, formatWaktu } from './geoUtils'

export function exportToExcel(event, attendances) {
  const rows = attendances.map((item, idx) => ({
    No: idx + 1,
    'NIP / NIK': item.identity_number,
    'Nama Lengkap': item.full_name,
    Jabatan: item.position || '-',
    'Instansi / Unit Kerja': item.organization,
    'No. HP': item.phone || '-',
    'Mode Hadir': item.attendance_type === 'onsite' ? 'Luring' : 'Daring',
    'Waktu Absen': formatWaktu(item.checked_in_at),
    Status: item.status === 'on_time' ? 'Tepat Waktu' : 'Terlambat',
    'Jarak GPS (m)': item.distance_meters ?? '-',
    'Tautan Tanda Tangan': item.signature_url,
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Daftar Hadir')
  XLSX.writeFile(workbook, `Daftar_Hadir_${event.slug}.xlsx`)
}

async function urlToBase64(url) {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function exportToOfficialPDF(event, attendances) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Muat semua gambar tanda tangan menjadi base64
  const sigMap = {}
  await Promise.all(
    attendances.map(async (item) => {
      if (item.signature_url) {
        sigMap[item.id] = await urlToBase64(item.signature_url)
      }
    })
  )

  // Judul Dokumen
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('DAFTAR HADIR KEGIATAN', 105, 18, { align: 'center' })

  doc.setFontSize(11)
  doc.text(event.title.toUpperCase(), 105, 25, { align: 'center' })

  // Informasi Meta Kegiatan
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text(`Penyelenggara : ${event.organizer || '-'}`, 14, 35)
  doc.text(`Hari / Tanggal : ${formatTanggalIndo(event.event_date)}`, 14, 40.5)
  doc.text(`Lokasi / Tempat : ${event.location_name}`, 14, 46)

  const tableBody = attendances.map((item, idx) => [
    idx + 1,
    `${item.full_name}\nNIP/NIK: ${item.identity_number}`,
    `${item.position || '-'}\n${item.organization}`,
    `${formatWaktu(item.checked_in_at)}\n(${item.status === 'on_time' ? 'Tepat Waktu' : 'Terlambat'})`,
    '', // Kolom tanda tangan dirender via didDrawCell
  ])

  autoTable(doc, {
    startY: 52,
    head: [['No', 'Nama & Identitas', 'Jabatan & Instansi', 'Waktu Hadir', 'Tanda Tangan']],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      valign: 'middle',
      textColor: [15, 23, 42],
      lineColor: [148, 163, 184],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 54 },
      2: { cellWidth: 54 },
      3: { cellWidth: 32, halign: 'center' },
      4: { cellWidth: 32, halign: 'center' },
    },
    bodyStyles: {
      minCellHeight: 15,
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const item = attendances[data.row.index]
        const base64Img = sigMap[item?.id]
        if (base64Img) {
          const imgW = 24
          const imgH = 11
          const x = data.cell.x + (data.cell.width - imgW) / 2
          const y = data.cell.y + (data.cell.height - imgH) / 2
          doc.addImage(base64Img, 'PNG', x, y, imgW, imgH)
        }
      }
    },
  })

  // Blok Penandatangan di Halaman Terakhir
  const finalY = doc.lastAutoTable.finalY + 14
  const pageHeight = doc.internal.pageSize.height
  const signY = finalY + 35 > pageHeight ? (doc.addPage(), 25) : finalY

  doc.setFontSize(9.5)
  doc.text(`Mengetahui,`, 135, signY)
  doc.text(`Penanggung Jawab Kegiatan`, 135, signY + 5)
  doc.text(`( ........................................ )`, 135, signY + 26)

  doc.save(`Daftar_Hadir_Resmi_${event.slug}.pdf`)
}