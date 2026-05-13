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
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: ACCEPT_HEADER,
    },
  });

  if (!res.ok) throw new Error(`Bol.com ${path} fout: ${res.status}`);
  return res.json();
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

// Orders list geeft geen prijs terug — detail ophalen per order
async function fetchOrderDetail(orderId) {
  return bolGet(`/orders/${orderId}`);
}

export async function fetchBolOrders() {
  const { start, end } = lastQuarterRange();
  const orderIds = [];
  let page = 1;

  // API ondersteunt max 3 maanden geschiedenis
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const latestChangeDate = (start > threeMonthsAgo ? start : threeMonthsAgo)
    .toISOString()
    .split('T')[0];

  while (true) {
    const data = await bolGet('/orders', {
      'fulfilment-method': 'FBR',
      status: 'ALL',
      // 'latest-change-date': latestChangeDate,
      page,
    });

    const pageOrders = data.orders ?? [];
    if (pageOrders.length === 0) break;

    for (const order of pageOrders) {
      const placed = new Date(order.orderPlacedDateTime);
      if (placed >= start && placed <= end) orderIds.push(order.orderId);
    }

    page++;
  }

  // Detail ophalen voor prijs (unitPrice zit alleen in order detail)
  const details = await Promise.all(orderIds.map(fetchOrderDetail));
  return details;
}

export async function fetchBolReturns() {
  const { start, end } = lastQuarterRange();
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
