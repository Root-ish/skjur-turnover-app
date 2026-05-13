import { authenticate } from "../shopify.server";
import { runTurnover } from "../utils/turnover/runTurnover.server.js";

function buildAdminFromToken(shopDomain, accessToken) {
  return {
    graphql: async (query, options = {}) => {
      const res = await fetch(
        `https://${shopDomain}/admin/api/2026-07/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({
            query: typeof query === 'string' ? query.replace(/^#graphql\n?/, '') : query,
            variables: options.variables ?? {},
          }),
        }
      );
      return { json: () => res.json() };
    },
  };
}

export const action = async ({ request }) => {
  // Clone vóór authenticate.webhook — die leest de body voor HMAC verificatie
  const bodyText = await request.clone().text();

  await authenticate.webhook(request);

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { shopify_domain: shopDomain, shopify_access_token: accessToken } = payload;

  if (!shopDomain || !accessToken) {
    console.error('[flow] Ontbrekende shopify_domain of shopify_access_token');
    return new Response('Missing required fields', { status: 400 });
  }

  console.log(`[flow] Kwartaaloverzicht gestart voor ${shopDomain}`);

  const admin = buildAdminFromToken(shopDomain, accessToken);

  try {
    const result = await runTurnover(admin);
    console.log(`[flow] Klaar — ${result.filename} | ${result.totalRows} rijen`);
    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[flow] Fout:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
