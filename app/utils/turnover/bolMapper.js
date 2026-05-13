// Maps bol.com order/return objects to the Shopify analytics row format
// so they pass through formatRow unchanged.
//
// Order detail schema (OrderOrderItem):
//   orderItemId, quantity, unitPrice, totalPrice, commission
//   product: { ean, title }
//   offer: { offerId, reference }
//   discounts: []
//
// ReturnItem schema:
//   rmaId, orderId, ean, title, expectedQuantity
//   (geen unitPrice beschikbaar in de returns API)

export function mapBolOrderToRows(order) {
  const day = order.orderPlacedDateTime
    ? new Date(order.orderPlacedDateTime).toISOString()
    : null;

  return (order.orderItems ?? []).map(item => ({
    order_name: order.orderId,
    product_variant_sku: item.product?.ean ?? '',
    product_title: item.product?.title ?? '',
    quantity_ordered: String(item.quantity ?? 0),
    product_variant_price: String(item.unitPrice ?? 0),
    order_level_discounts: '0',
    day,
    discount_type: null,
    discount_value: null,
    gross_returns: '0',
    quantity_returned: '0',
    net_sales: String((item.unitPrice ?? 0) * (item.quantity ?? 1)),
    _source: 'Bol.com',
  }));
}

export function mapBolReturnToRows(ret) {
  const day = ret.registrationDateTime
    ? new Date(ret.registrationDateTime).toISOString()
    : null;

  return (ret.returnItems ?? []).map(item => {
    // ReturnItem heeft geen unitPrice — gross_returns op 0 laten en net_sales weglaten
    // zodat formatRow de prijs niet fout berekent
    const qty = Math.abs(item.expectedQuantity ?? 1);

    return {
      order_name: item.orderId,
      product_variant_sku: item.ean ?? '',
      product_title: item.title ?? '',
      quantity_ordered: '0',
      product_variant_price: '0',
      order_level_discounts: '0',
      day,
      discount_type: null,
      discount_value: null,
      gross_returns: String(-qty), // negatieve quantity als proxy; prijs onbekend
      quantity_returned: String(-qty),
      net_sales: null,
      _source: 'Bol.com',
    };
  });
}
