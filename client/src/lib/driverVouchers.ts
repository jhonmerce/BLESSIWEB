import type jsPDF from 'jspdf';
import type { AnyRow } from '../types';
import { nfmt } from './format';
import { localDateTimeFilename, safePdfFilenamePart } from './pdfFilename';

const PAGE_WIDTH = 210;
const TABLE_X = 14;
const TABLE_WIDTH = PAGE_WIDTH - TABLE_X * 2;
const LABEL_WIDTH = 61;
const NAVY: [number, number, number] = [18, 37, 68];
const BORDER: [number, number, number] = [203, 213, 225];

const formattedDate = (value: string | Date) =>
  new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));

async function createVoucher(title: string, reference: string, operationDate: string | Date) {
  const { default: JsPDF } = await import('jspdf');
  const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, PAGE_WIDTH, 56, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text('BLESSING PETROLEUM', TABLE_X, 18);
  pdf.setFontSize(11);
  pdf.text(title, TABLE_X, 31);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Référence : ${reference}`, TABLE_X, 42);
  pdf.text(`Date et heure : ${formattedDate(operationDate)}`, TABLE_X, 49);
  pdf.setDrawColor(...BORDER);
  pdf.line(TABLE_X, 56, PAGE_WIDTH - TABLE_X, 56);
  return pdf;
}

function addDetailsTable(pdf: jsPDF, entries: Array<[string, string]>) {
  const headerY = 62;
  const headerHeight = 10;
  let rowY = headerY + headerHeight;

  pdf.setFillColor(...NAVY);
  pdf.rect(TABLE_X, headerY, TABLE_WIDTH, headerHeight, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('INFORMATION', TABLE_X + 3, headerY + 6.5);
  pdf.text('DÉTAIL', TABLE_X + LABEL_WIDTH + 3, headerY + 6.5);

  entries.forEach(([label, value], index) => {
    const lines = pdf.splitTextToSize(value || '—', TABLE_WIDTH - LABEL_WIDTH - 8);
    const rowHeight = Math.max(10, lines.length * 4 + 4);

    pdf.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 252 : 255);
    pdf.rect(TABLE_X, rowY, TABLE_WIDTH, rowHeight, 'F');
    pdf.setDrawColor(...BORDER);
    pdf.rect(TABLE_X, rowY, TABLE_WIDTH, rowHeight, 'S');
    pdf.line(TABLE_X + LABEL_WIDTH, rowY, TABLE_X + LABEL_WIDTH, rowY + rowHeight);

    pdf.setTextColor(30, 41, 59);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(label, TABLE_X + 3, rowY + 6.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(lines, TABLE_X + LABEL_WIDTH + 3, rowY + 5.5);
    rowY += rowHeight;
  });

  return rowY;
}

function addSignatureArea(pdf: jsPDF) {
  pdf.setDrawColor(...BORDER);
  pdf.line(14, 183, 82, 183);
  pdf.line(128, 183, 196, 183);
  pdf.setTextColor(...NAVY);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Agent de station', 14, 190);
  pdf.text('Signature du chauffeur', 128, 190);
}

export async function downloadProvisionVoucher(result: AnyRow) {
  const movement = result.mouvement;
  const driver = result.chauffeur;
  const fuel = result.carburant;
  const pdf = await createVoucher(
    'BORDEREAU D’APPROVISIONNEMENT',
    movement.id,
    movement.date || movement.creeLe,
  );
  const tableBottom = addDetailsTable(pdf, [
    ['Entreprise', driver.entreprise?.nom || '—'],
    ['Chauffeur', driver.nom],
    ['Téléphone', driver.telephone],
    ['Véhicule / plaque', `${driver.marque} · ${driver.plaque}`],
    ['Carburant', fuel.nom],
    ['Quantité approvisionnée', `${nfmt(Number(movement.quantite))} L`],
    ['Solde avant', `${nfmt(Number(result.soldeAvantLitres))} L`],
    ['Nouveau solde', `${nfmt(Number(result.soldeLitres))} L`],
  ]);
  pdf.setTextColor(...NAVY);
  pdf.setFontSize(9);
  pdf.text('Transfert de litres au compte chauffeur. Aucun montant.', TABLE_X, Math.min(tableBottom + 8, 174));
  addSignatureArea(pdf);
  const filename = [
    'bordereau-approvisionnement',
    safePdfFilenamePart(driver.nom),
    safePdfFilenamePart(driver.plaque),
    localDateTimeFilename(movement.date || movement.creeLe),
  ].join('-');
  pdf.save(`${filename}.pdf`);
}

export async function downloadExitVoucher(sale: AnyRow) {
  const driver = sale.chauffeur;
  if (!driver) return;

  const pdf = await createVoucher('BORDEREAU DE SORTIE CARBURANT', sale.id, sale.date);
  const tableBottom = addDetailsTable(pdf, [
    ['Entreprise', driver.entreprise?.nom || '—'],
    ['Chauffeur', driver.nom],
    ['Téléphone', driver.telephone],
    ['Véhicule / plaque', `${driver.marque} · ${driver.plaque}`],
    ['Carburant servi', sale.carburant?.nom || '—'],
    ['Quantité sortie', `${nfmt(Number(sale.quantite))} L`],
    ['Solde après sortie', `${nfmt(Number(sale.soldeChauffeurApres ?? 0))} L`],
  ]);
  pdf.setTextColor(...NAVY);
  pdf.setFontSize(9);
  pdf.text('Sortie déduite des litres prépayés du compte chauffeur.', TABLE_X, Math.min(tableBottom + 7, 168));
  pdf.text('Aucun nouveau paiement exigible pour cette sortie.', TABLE_X, Math.min(tableBottom + 14, 175));
  addSignatureArea(pdf);
  const filename = [
    'bordereau-sortie',
    safePdfFilenamePart(driver.nom),
    safePdfFilenamePart(driver.plaque),
    localDateTimeFilename(sale.date),
  ].join('-');
  pdf.save(`${filename}.pdf`);
}
