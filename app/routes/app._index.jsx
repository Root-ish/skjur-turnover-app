import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { runTurnover } from "../utils/turnover/runTurnover.server.js";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();

  const includeShopify = form.get("includeShopify") === "true";
  const includeBol = form.get("includeBol") === "true";

  if (!includeShopify && !includeBol) {
    return { success: false, error: "Selecteer minimaal één bron." };
  }

  try {
    const result = await runTurnover(admin, { includeShopify, includeBol });
    return { success: true, ...result };
  } catch (err) {
    console.error('[turnover] Fout:', err.message);
    return { success: false, error: err.message };
  }
};

function getPreviousQuarterLabel() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const prevQ = q === 0 ? 4 : q;
  const year = q === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return `Q${prevQ} ${year}`;
}

function getNextRunDate() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const nextMonth = ((q + 1) % 4) * 3;
  const nextYear = q === 3 ? now.getFullYear() + 1 : now.getFullYear();
  return new Date(nextYear, nextMonth, 1).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12px',
  fontFamily: 'monospace',
};
const thStyle = {
  background: '#f6f6f7',
  borderBottom: '2px solid #e1e3e5',
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: '600',
  whiteSpace: 'nowrap',
};
const tdStyle = {
  borderBottom: '1px solid #e1e3e5',
  padding: '6px 12px',
  whiteSpace: 'nowrap',
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isLoading = ["loading", "submitting"].includes(fetcher.state);
  const data = fetcher.data;

  const [includeShopify, setIncludeShopify] = useState(true);
  const [includeBol, setIncludeBol] = useState(true);

  useEffect(() => {
    if (data?.success === true) {
      shopify.toast.show(`CSV gegenereerd: ${data.filename}`);
    } else if (data?.success === false) {
      shopify.toast.show('Er is een fout opgetreden', { isError: true });
    }
  }, [data]);

  const triggerTurnover = () => {
    fetcher.submit(
      { includeShopify: String(includeShopify), includeBol: String(includeBol) },
      { method: "POST" }
    );
  };

  return (
    <s-page heading="Kwartaaloverzicht">
      <s-section heading="Bronnen">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Selecteer welke bronnen meegenomen worden in de CSV voor{" "}
            <s-text emphasis="bold">{getPreviousQuarterLabel()}</s-text>.
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeShopify}
                onChange={e => setIncludeShopify(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <s-text emphasis="bold">Shopify</s-text>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeBol}
                onChange={e => setIncludeBol(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <s-text emphasis="bold">Bol.com</s-text>
            </label>
          </s-stack>
          <div>
            <s-button
              onClick={triggerTurnover}
              {...(isLoading ? { loading: true } : {})}
            >
              Genereer CSV
            </s-button>
          </div>
        </s-stack>
      </s-section>

      <s-section heading="Automatische verwerking">
        <s-paragraph>
          De kwartaalomzet wordt automatisch verwerkt via{" "}
          <s-text emphasis="bold">Shopify Flow</s-text> op{" "}
          <s-text emphasis="bold">{getNextRunDate()}</s-text> (1e dag van het
          nieuwe kwartaal). De Flow actie{" "}
          <s-text emphasis="bold">Genereer Kwartaaloverzicht</s-text> haalt
          altijd beide bronnen op.
        </s-paragraph>
      </s-section>

      {isLoading && (
        <s-section heading="Bezig met ophalen...">
          <s-paragraph>
            Data wordt gepagineerd opgehaald
            {includeShopify && includeBol && ' van Shopify en Bol.com'}
            {includeShopify && !includeBol && ' van Shopify'}
            {!includeShopify && includeBol && ' van Bol.com'}
            . Dit kan even duren bij grote aantallen orders.
          </s-paragraph>
        </s-section>
      )}

      {data?.success === true && (
        <>
          <s-section heading="Resultaat">
            <s-stack direction="block" gap="base">
            <s-banner status="success">
              <s-text emphasis="bold">{data.filename}</s-text> aangemaakt —{" "}
              <s-text emphasis="bold">{data.totalRows}</s-text> rijen
              {data.shopifyRows > 0 && data.bolRows > 0 && ` (Shopify: ${data.shopifyRows}, Bol.com: ${data.bolRows})`}
              {data.shopifyRows > 0 && data.bolRows === 0 && ` (Shopify: ${data.shopifyRows})`}
              {data.shopifyRows === 0 && data.bolRows > 0 && ` (Bol.com: ${data.bolRows})`}
            </s-banner>
            {data.webhookOk === false && (
              <s-banner status="warning">
                Make webhook niet bereikbaar — CSV is wel opgeslagen op de server. Zet het scenario aan in Make en probeer opnieuw.{data.webhookError ? ` (${data.webhookError})` : ''}
              </s-banner>
            )}
            {data.webhookOk === true && (
              <s-banner status="info">
                CSV succesvol verstuurd naar Make.
              </s-banner>
            )}
            </s-stack>
          </s-section>

          {data.previewRows?.length > 0 && (
            <s-section heading={`Eerste ${data.previewRows.length} rijen`}>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        {data.previewColumns.map(col => (
                          <th key={col} style={thStyle}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.previewRows.map((row, i) => (
                        <tr key={i}>
                          {Object.values(row).map((val, j) => (
                            <td key={j} style={tdStyle}>{val}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </s-box>
            </s-section>
          )}
        </>
      )}

      {data?.success === false && (
        <s-section heading="Fout">
          <s-banner status="critical">{data.error}</s-banner>
        </s-section>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
