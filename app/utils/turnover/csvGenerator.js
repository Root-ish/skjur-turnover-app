import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CSV_HEADERS = [
  'Invoice No',
  'Date',
  'Client Nr.',
  'Client name',
  'Distribution channel',
  'Article Nr.',
  'Article name',
  'Sales quantity',
  'Free goods quantity',
  'Total quantity',
  'Gross price currency',
  'Currency',
  'Exchange rate',
  'Gross price',
  'VAT',
  'Total gross I without VAT',
  'Total gross I with VAT',
  'Sales deduction for free goods',
  'Discount',
  'Gross II without VAT',
  'Cash discount',
  'Net',
  'Invoice reffering number',
];

const ROW_KEYS = [
  'id',
  'date',
  'clientId',
  'clientName',
  'distributionChannel',
  'articleId',
  'articleName',
  'salesQuantity',
  'freeGoodsQuantity',
  'totalQuantity',
  'grossPriceCurrency',
  'currency',
  'exchangeRate',
  'grossPrice',
  'vatRate',
  'totalGrossWithoutVAT',
  'totalGrossWithVAT',
  'salesDeductionForFreeGoods',
  'discount',
  'grossWithoutVAT',
  'cashDiscount',
  'net',
  'invoiceRefferingNumber',
];

function escapeCell(val) {
  const str = val === undefined || val === null ? '' : String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

function getPreviousQuarter() {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const prevQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
  const year = currentQuarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return { year, quarter: prevQuarter + 1 };
}

export function generateCsv(rows) {
  const headerLine = CSV_HEADERS.map(escapeCell).join(',');
  const dataLines = rows.map(row =>
    ROW_KEYS.map(key => escapeCell(row[key])).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

export function saveCsv(csvContent) {
  const { year, quarter } = getPreviousQuarter();
  const filename = `turnover_${year}_Q${quarter}.csv`;
  const csvDir = path.resolve(__dirname, '..', 'csv');

  if (!fs.existsSync(csvDir)) {
    fs.mkdirSync(csvDir, { recursive: true });
  }

  const filePath = path.join(csvDir, filename);
  fs.writeFileSync(filePath, csvContent, 'utf-8');
  console.log(`[csv] Opgeslagen: ${filePath}`);
  return { filePath, filename };
}

export async function sendCsvToWebhook(filePath, filename) {
  const WEBHOOK_URL = 'https://hook.eu2.make.com/5n6kq7g6v8wx54dl3evds61izkw1xqig';

  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'text/csv' });

  const form = new FormData();
  form.append('file', blob, filename);

  console.log(`[webhook] CSV versturen naar Make: ${filename}`);

  try {
    const res = await fetch(WEBHOOK_URL, { method: 'POST', body: form });
    const text = await res.text();

    if (!res.ok) {
      console.warn(`[webhook] Verzenden mislukt (${res.status}): ${text}`);
      return { ok: false, status: res.status, message: text };
    }

    console.log(`[webhook] CSV succesvol verstuurd (status ${res.status})`);
    return { ok: true, status: res.status };
  } catch (err) {
    console.warn(`[webhook] Netwerk fout: ${err.message}`);
    return { ok: false, status: null, message: err.message };
  }
}
