import { authenticate } from "../shopify.server";
import { runTurnover } from "../utils/turnover/runTurnover.server.js";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const result = await runTurnover(admin);
    return Response.json({ success: true, ...result });
  } catch (err) {
    console.error('[turnover] Fout:', err.message);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
};
