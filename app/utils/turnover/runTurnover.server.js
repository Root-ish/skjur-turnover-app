import { formatRow } from './formatRow.js';
import { fetchBolOrders, fetchBolReturns } from './bolClient.js';
import { mapBolOrderToRows, mapBolReturnToRows } from './bolMapper.js';
import { generateCsv, saveCsv, sendCsvToWebhook } from './csvGenerator.js';

const PAGE_SIZE = 1;

// ShopifyQL query exact zoals gespecificeerd in turnover.md
// Paginatie via LIMIT/OFFSET in de query string — 'after' argument wordt niet ondersteund
const BASE_SHOPIFY_QUERY = `FROM sales SHOW gross_sales, product_variant_sku, product_title, customer_id, quantity_ordered, net_sales, line_item_discounts, product_variant_price, order_level_discounts, day, discount_type, discount_value, gross_returns, quantity_returned WHERE product_title IS NOT NULL GROUP BY order_name, customer_id, hour, product_variant_sku, product_title, discount_type, discount_value, product_variant_price, day, return_reason DURING today ORDER BY order_name ASC LIMIT ${PAGE_SIZE}`;

const GQL_QUERY = `#graphql
  query getQuarterlyTurnover($shopQuery: String!) {
    shopifyqlQuery(query: $shopQuery) {
      tableData {
        columns { name }
        rows
      }
    }
  }
`;

async function fetchShopifyRowsViaAdmin(admin) {
  console.log('[shopify] Kwartaaldata ophalen via ShopifyQL...');

  let allRows = [];
  let columns = null;
  let offset = 0;
  let hasMore = true;
  let page = 0;

  while (hasMore) {
    page++;
    const shopQuery = `${BASE_SHOPIFY_QUERY} OFFSET ${offset}`;

    const response = await admin.graphql(GQL_QUERY, { variables: { shopQuery } });
    const json = await response.json();

    if (json.errors) {
      console.error('[shopify] GraphQL errors:', JSON.stringify(json.errors));
      throw new Error(`[shopify] GraphQL fout: ${json.errors[0]?.message}`);
    }

    const tableData = json?.data?.shopifyqlQuery?.tableData;
    if (!tableData) {
      console.error('[shopify] Response:', JSON.stringify(json).slice(0, 500));
      throw new Error('[shopify] Geen tableData in response');
    }

    if (!columns) {
      columns = tableData.columns.map(c => c.name);
      console.log('[shopify] Kolommen:', JSON.stringify(columns));
    }

    const rawRows = tableData.rows ?? [];
    if (page === 1) {
      console.log('[shopify] Eerste rij (raw):', JSON.stringify(rawRows[0]));
    }

    // ShopifyQL rows kunnen arrays van waarden zijn (index-based)
    // of objecten met kolomnamen als keys — beide gevallen afhandelen
    const pageRows = rawRows.map(row => {
      let obj;
      if (Array.isArray(row)) {
        obj = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
      } else if (row && typeof row === 'object') {
        obj = { ...row };
      } else {
        obj = {};
      }
      obj._source = 'Shopify';
      return obj;
    });

    allRows = allRows.concat(pageRows);
    console.log(`[shopify] Pagina ${page}: ${pageRows.length} rijen (totaal: ${allRows.length})`);

    hasMore = pageRows.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  console.log(`[shopify] Klaar — ${allRows.length} rijen over ${page} pagina('s)`);
  return allRows;
}

const PREVIEW_COLUMNS = [
  { key: 'id',                  label: 'Invoice No' },
  { key: 'date',                label: 'Date' },
  { key: 'distributionChannel', label: 'Channel' },
  { key: 'articleId',           label: 'Article Nr.' },
  { key: 'articleName',         label: 'Article name' },
  { key: 'salesQuantity',       label: 'Sales qty' },
  { key: 'freeGoodsQuantity',   label: 'Free qty' },
  { key: 'grossPrice',          label: 'Gross price' },
  { key: 'discount',            label: 'Discount %' },
  { key: 'net',                 label: 'Net' },
];

/**
 * @param {object} admin - Shopify admin sessie
 * @param {{ includeShopify: boolean, includeBol: boolean }} options
 */
export async function runTurnover(admin, { includeShopify = true, includeBol = true } = {}) {
  console.log(`[turnover] Start — Shopify: ${includeShopify}, Bol.com: ${includeBol}`);

  const [shopifyRawRows, bolOrders, bolReturns] = await Promise.all([
    includeShopify ? fetchShopifyRowsViaAdmin(admin) : Promise.resolve([]),
    includeBol ? fetchBolOrders() : Promise.resolve([]),
    includeBol ? fetchBolReturns() : Promise.resolve([]),
  ]);

  const bolRawRows = includeBol ? [
    ...bolOrders.flatMap(mapBolOrderToRows),
    ...bolReturns.flatMap(mapBolReturnToRows),
  ] : [];

  console.log(`[turnover] Shopify rijen: ${shopifyRawRows.length} | Bol rijen: ${bolRawRows.length}`);

  const allRows = [
    ...shopifyRawRows.map(formatRow),
    ...bolRawRows.map(formatRow),
  ];
  console.log(`[turnover] Totaal geformatteerde rijen: ${allRows.length}`);

  const csvContent = generateCsv(allRows);
  const { filePath, filename } = saveCsv(csvContent);
  const webhook = await sendCsvToWebhook(filePath, filename);

  if (!webhook.ok) {
    console.warn(`[turnover] CSV opgeslagen maar webhook mislukt: ${webhook.status} — ${webhook.message}`);
  }

  console.log(`[turnover] Klaar! ${filename} | ${allRows.length} rijen`);

  const previewRows = allRows.slice(0, 10).map(row =>
    PREVIEW_COLUMNS.reduce((acc, { key }) => ({ ...acc, [key]: row[key] ?? '' }), {})
  );

  return {
    filename,
    totalRows: allRows.length,
    shopifyRows: shopifyRawRows.length,
    bolRows: bolRawRows.length,
    previewColumns: PREVIEW_COLUMNS.map(c => c.label),
    previewRows,
    webhookOk: webhook.ok,
    webhookError: webhook.ok ? null : `${webhook.status ? `${webhook.status} — ` : ''}${webhook.message}`,
  };
}
