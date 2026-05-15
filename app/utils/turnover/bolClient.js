const TOKEN_URL = 'https://login.bol.com/token';
const API_BASE = 'https://api.bol.com/retailer';
const ACCEPT_HEADER = 'application/vnd.retailer.v10+json';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const credentials = Buffer.from(
    `${process.env.BOL_CLIENT_ID}:${process.env.BOL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bol.com auth mislukt: ${res.status} — ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  console.log('[bol] access_token:', cachedToken);
  return cachedToken;
}

async function bolGet(path, params = {}) {
  const token = await getAccessToken();
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const headers = new Headers();
  headers.append('Accept', ACCEPT_HEADER);
  headers.append('Authorization', `Bearer ${token}`);

  console.log('[bol] GET', url.toString());
  console.log('[bol] headers', Object.fromEntries(headers.entries()));

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers,
    redirect: 'follow',
  });

  console.log('[bol] response status', res.status);
  const body = await res.text();
  console.log('[bol] response body', body);

  if (!res.ok) throw new Error(`Bol.com ${path} fout: ${res.status}`);
  return JSON.parse(body);
}

function lastQuarterRange() {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const prevQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
  const year = currentQuarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const startMonth = prevQuarter * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
  console.log(`[bol] kwartaal bereik: ${start.toISOString()} — ${end.toISOString()}`);
  return { start, end };
}

function resolveDateRange(dateRange) {
  if (dateRange?.startDate && dateRange?.endDate) {
    const start = new Date(dateRange.startDate + 'T00:00:00.000Z');
    const end = new Date(dateRange.endDate + 'T23:59:59.999Z');
    console.log(`[bol] aangepast bereik: ${start.toISOString()} — ${end.toISOString()}`);
    return { start, end };
  }
  return lastQuarterRange();
}

// Orders list geeft geen prijs terug — detail ophalen per order
async function fetchOrderDetail(orderId) {
  return bolGet(`/orders/${orderId}`);
}

export async function fetchBolOrders(dateRange = null) {
  const { start, end } = resolveDateRange(dateRange);

  // API max 3 maanden terug
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  threeMonthsAgo.setDate(threeMonthsAgo.getDate() + 1);
  const latestChangeDate = threeMonthsAgo.toISOString().split('T')[0];

  const orderIds = new Set();
  let page = 1;

  while (true) {
    const data = await bolGet('/orders', {
      'fulfilment-method': 'ALL',
      status: 'ALL',
      // 'latest-change-date': latestChangeDate,
      page,
    });

    const pageOrders = data.orders ?? [];
    if (pageOrders.length === 0) break;

    // orderPlacedDateTime zit niet in de list-response, dus alle ids verzamelen
    for (const order of pageOrders) orderIds.add(order.orderId);

    page++;
  }

  // Details ophalen in batches van 5 om 429 te vermijden
  const ids = [...orderIds];
  const allDetails = [];
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i + 5);
    const results = await Promise.all(batch.map(fetchOrderDetail));
    allDetails.push(...results);
    if (i + 5 < ids.length) await new Promise(r => setTimeout(r, 500));
  }

  return allDetails.filter(detail => {
    const placed = new Date(detail.orderPlacedDateTime);
    return placed >= start && placed <= end;
  });
}

export async function fetchBolReturns(dateRange = null) {
  const { start, end } = resolveDateRange(dateRange);
  const returns = [];

  for (const handled of [false, true]) {
    let page = 1;
    while (true) {
      const data = await bolGet('/returns', { handled: String(handled), page });
      const pageReturns = data.returns ?? [];
      if (pageReturns.length === 0) break;

      for (const ret of pageReturns) {
        const registered = new Date(ret.registrationDateTime);
        if (registered >= start && registered <= end) returns.push(ret);
      }

      page++;
    }
  }

  return returns;
}
