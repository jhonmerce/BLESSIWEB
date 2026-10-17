import type jsPDF from 'jspdf';
import type { AnyRow } from '../types';
import { localDateTimeFilename } from './pdfFilename';

const PAGE_WIDTH = 148;
const MARGIN = 10;
const NAVY: [number, number, number] = [18, 37, 68];
const BLUE: [number, number, number] = [37, 99, 235];
const MUTED: [number, number, number] = [100, 116, 139];

function formatAmount(value: unknown, currency: string) {
  const amount = Number(value || 0);
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${formatted} ${currency}`;
}

function formatQuantity(value: unknown) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(Number(value || 0));
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function invoiceReference(id: string) {
  return `FAC-${id.slice(-8).toUpperCase()}`;
}

function invoiceText(value: unknown) {
  const normalized = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return normalized || '—';
}

function addCustomerTable(pdf: jsPDF, sale: AnyRow) {
  const x = MARGIN;
  const y = 73;
  const width = PAGE_WIDTH - MARGIN * 2;
  const rowHeight = 10;
  const halfWidth = width / 2;
  const rows = [
    [
      { label: 'NOM DU CLIENT', value: invoiceText(sale.clientNom || 'Client comptoir') },
      { label: 'TÉLÉPHONE', value: invoiceText(sale.clientTelephone) },
    ],
    [
      { label: 'PLAQUE', value: invoiceText(sale.clientPlaque) },
      { label: 'MARQUE DU VÉHICULE', value: invoiceText(sale.clientMarque) },
    ],
  ];

  pdf.setDrawColor(203, 213, 225);
  pdf.setFillColor(248, 250, 252);
  pdf.rect(x, y, width, rowHeight * 2, 'FD');
  pdf.line(x + halfWidth, y, x + halfWidth, y + rowHeight * 2);
  pdf.line(x, y + rowHeight, x + width, y + rowHeight);

  rows.forEach((row, rowIndex) =>
    row.forEach((cell, columnIndex) => {
      const cellX = x + columnIndex * halfWidth + 3;
      const cellY = y + rowIndex * rowHeight;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(5.5);
      pdf.setTextColor(...MUTED);
      pdf.text(cell.label, cellX, cellY + 3.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(30, 41, 59);
      pdf.text(pdf.splitTextToSize(cell.value, halfWidth - 6).slice(0, 1), cellX, cellY + 7.6);
    }),
  );
}

function addInvoiceTable(pdf: jsPDF, sale: AnyRow) {
  const x = MARGIN;
  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  const headerY = 102;
  const headerHeight = 11;
  const rowY = headerY + headerHeight;
  const rowHeight = 22;
  const columns = [
    { title: 'DÉSIGNATION', x: 12, width: 47, align: 'left' as const },
    { title: 'QTÉ (L)', x: 60, width: 20, align: 'right' as const },
    { title: 'PRIX / L', x: 82, width: 27, align: 'right' as const },
    { title: 'TOTAL', x: 111, width: 25, align: 'right' as const },
  ];

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(255, 255, 255);
  pdf.setFillColor(...NAVY);
  pdf.roundedRect(x, headerY, tableWidth, headerHeight, 1.5, 1.5, 'F');
  columns.forEach((column) => {
    pdf.text(
      column.title,
      column.align === 'right' ? column.x + column.width : column.x,
      headerY + 7,
      {
        align: column.align,
      },
    );
  });

  pdf.setFillColor(246, 248, 251);
  pdf.rect(x, rowY, tableWidth, rowHeight, 'F');
  pdf.setDrawColor(226, 232, 240);
  pdf.rect(x, rowY, tableWidth, rowHeight, 'S');
  pdf.setTextColor(30, 41, 59);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  const fuelName = String(sale.carburant?.nom || 'Carburant');
  const fuelLines = pdf.splitTextToSize(fuelName, 44).slice(0, 2);
  pdf.text(fuelLines, 12, rowY + 9);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(formatQuantity(sale.quantite), 80, rowY + 12, { align: 'right' });
  pdf.text(formatAmount(sale.prixUnitaire, sale.devise || 'USD'), 109, rowY + 12, {
    align: 'right',
  });
  pdf.setFont('helvetica', 'bold');
  pdf.text(formatAmount(sale.montant, sale.devise || 'USD'), 136, rowY + 12, { align: 'right' });

  const totalY = rowY + rowHeight;
  const totalRowHeight = 12;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(x, totalY, tableWidth, totalRowHeight, 'F');

  pdf.setDrawColor(203, 213, 225);
  pdf.rect(x, headerY, tableWidth, headerHeight + rowHeight + totalRowHeight, 'S');
  pdf.line(x, rowY, x + tableWidth, rowY);
  pdf.line(x, totalY, x + tableWidth, totalY);
  [59, 81, 110].forEach((columnX) => {
    pdf.line(columnX, headerY, columnX, totalY);
  });
  pdf.line(110, totalY, 110, totalY + totalRowHeight);

  pdf.setTextColor(...NAVY);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('TOTAL À PAYER', 108, totalY + 8, { align: 'right' });
  pdf.setFontSize(9);
  pdf.text(formatAmount(sale.montant, sale.devise || 'USD'), 136, totalY + 8, {
    align: 'right',
  });

  return totalY + totalRowHeight;
}

export async function downloadSaleInvoice(sale: AnyRow) {
  const { default: JsPDF } = await import('jspdf');
  const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
  const currency = sale.devise || 'USD';
  const reference = invoiceReference(String(sale.id));

  pdf.setProperties({
    title: `Facture ${reference} - BLESSING PETROLEUM`,
    subject: 'Facture de vente de carburant',
    creator: 'BLESSING PETROLEUM',
  });

  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, PAGE_WIDTH, 42, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text('BLESSING PETROLEUM', MARGIN, 17);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('FACTURE DE VENTE', MARGIN, 29);
  pdf.setFontSize(8);
  pdf.text(`N° ${reference}`, PAGE_WIDTH - MARGIN, 29, { align: 'right' });

  pdf.setTextColor(...MUTED);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text('Date et heure', MARGIN, 52);
  pdf.setTextColor(...NAVY);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text(formatDate(sale.date), MARGIN, 59);

  pdf.setTextColor(...BLUE);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('CLIENT ET VÉHICULE', MARGIN, 69);
  addCustomerTable(pdf, sale);

  pdf.text('DÉTAIL DE LA VENTE', MARGIN, 98);
  const tableBottom = addInvoiceTable(pdf, sale);

  let detailsY = tableBottom + 8;

  const convertedAmount = Number(sale.montantConverti);
  const convertedCurrency = String(sale.deviseConvertie || '');
  if (Number.isFinite(convertedAmount) && convertedCurrency && convertedCurrency !== currency) {
    detailsY += 8;
    pdf.setTextColor(...MUTED);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.text(
      `Équivalent : ${formatAmount(convertedAmount, convertedCurrency)}`,
      PAGE_WIDTH - MARGIN,
      detailsY,
      {
        align: 'right',
      },
    );
    if (sale.tauxUtilise) {
      detailsY += 5;
      const rate = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 }).format(
        Number(sale.tauxUtilise),
      );
      pdf.text(`Taux : 1 ${currency} = ${rate} ${convertedCurrency}`, PAGE_WIDTH - MARGIN, detailsY, {
        align: 'right',
      });
    }
  }

  const footerY = 183;
  pdf.setDrawColor(203, 213, 225);
  pdf.line(MARGIN, footerY, PAGE_WIDTH - MARGIN, footerY);
  pdf.setTextColor(...MUTED);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.text('Merci de votre confiance.', MARGIN, footerY + 8);
  pdf.setTextColor(...NAVY);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.text('BLESSING PETROLEUM', PAGE_WIDTH - MARGIN, footerY + 8, { align: 'right' });
  pdf.setTextColor(...MUTED);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.text('Document à conserver', MARGIN, footerY + 14);
  pdf.line(91, footerY + 19, PAGE_WIDTH - MARGIN, footerY + 19);
  pdf.text('Signature / cachet', PAGE_WIDTH - MARGIN, footerY + 24, { align: 'right' });

  pdf.save(
    `facture-blessing-petroleum-${localDateTimeFilename(sale.date)}-${reference.toLowerCase()}.pdf`,
  );
}
