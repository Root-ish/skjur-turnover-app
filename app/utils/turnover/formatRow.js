const round = (val) => parseFloat(Number(val).toFixed(2));

export const formatRow = (rowData) => {
  const {
    product_variant_sku,
    product_title,
    quantity_ordered,
    order_name,
    discount_type,
    discount_value,
    product_variant_price,
    day,
    gross_returns,
    quantity_returned,
    order_level_discounts,
    net_sales,
    customer_id,
    _source,
  } = rowData;

  const finalObject = {
    clientId: customer_id ?? process.env.CLIENT_NUMBER ?? 12345,
    clientName: 'Skjur',
    distributionChannel: _source || 'Online',
    currency: 'EUR',
    exchangeRate: 1,
    vatRate: 21,
    cashDiscount: 0,
  };

  const isReturn = gross_returns && Number(gross_returns) < 0;
  const returnMultiplier = isReturn ? -1 : 1;

  if (isReturn) {
    if (order_name) {
      finalObject['id'] = `Credit Note ${product_variant_sku}-${order_name}`;
    }

    if (day) {
      finalObject['date'] = new Date(day).toLocaleDateString('nl-NL');
    }

    if (product_variant_sku) finalObject['articleId'] = product_variant_sku;
    if (product_title) finalObject['articleName'] = product_title;

    const absQuantityReturned = quantity_returned ? Math.abs(Number(quantity_returned)) : 0;
    finalObject['salesQuantity'] = absQuantityReturned;
    finalObject['totalQuantity'] = absQuantityReturned;

    let freeGoodsQuantity = 0;
    if (discount_type && discount_value && Number(discount_value) === 100) {
      freeGoodsQuantity = absQuantityReturned;
    }
    finalObject['freeGoodsQuantity'] = freeGoodsQuantity;

    if (product_variant_price) {
      const price = Number(product_variant_price);
      finalObject['grossPriceCurrency'] = round(price * returnMultiplier);
      finalObject['grossPrice'] = round(price * returnMultiplier);
    }

    if (product_variant_price && finalObject['totalQuantity']) {
      const totalGrossWithoutVAT = Number(product_variant_price) * Number(finalObject['totalQuantity']);
      finalObject['totalGrossWithoutVAT'] = round(Math.abs(totalGrossWithoutVAT));
    }

    if (finalObject['totalGrossWithoutVAT']) {
      const totalGrossWithVAT = Number(finalObject['totalGrossWithoutVAT']) * (1 + (finalObject['vatRate'] / 100));
      finalObject['totalGrossWithVAT'] = round(totalGrossWithVAT);
    }

    const discountPercentage = discount_value ? Number(discount_value) : 0;
    finalObject['discount'] = round(discountPercentage);

    const orderLevelDiscount = order_level_discounts ? Number(order_level_discounts) : 0;
    finalObject['salesDeductionForFreeGoods'] = round(orderLevelDiscount * returnMultiplier);

    if (finalObject['totalGrossWithVAT']) {
      finalObject['grossWithoutVAT'] = round(-Number(finalObject['totalGrossWithVAT']));
    } else if (gross_returns && Number(gross_returns) < 0) {
      finalObject['grossWithoutVAT'] = round(Number(gross_returns));
    } else {
      finalObject['grossWithoutVAT'] = 0;
    }

    if (net_sales) {
      finalObject['net'] = round(Number(net_sales));
    } else if (discountPercentage === 100 && absQuantityReturned > 0) {
      finalObject['net'] = 0;
    } else if (finalObject['grossWithoutVAT']) {
      const netExclVAT = Number(finalObject['grossWithoutVAT']) / (1 + (finalObject['vatRate'] / 100));
      finalObject['net'] = round(netExclVAT);
    } else {
      finalObject['net'] = 0;
    }

    if (order_name) finalObject['invoiceRefferingNumber'] = order_name;

  } else {
    if (order_name) finalObject['id'] = order_name;

    if (day) {
      finalObject['date'] = new Date(day).toLocaleDateString('nl-NL');
    }

    if (product_variant_sku) finalObject['articleId'] = product_variant_sku;
    if (product_title) finalObject['articleName'] = product_title;

    let totalQuantity = Number(quantity_ordered) || 0;

    if (totalQuantity === 0 && order_level_discounts && product_variant_price) {
      const discountAmount = Math.abs(Number(order_level_discounts));
      const price = Number(product_variant_price);
      if (discountAmount > 0 && price > 0) {
        totalQuantity = Math.round(discountAmount / price);
      }
    }

    let freeGoodsQuantity = 0;
    if (discount_type && discount_value) {
      if (discount_type.toLowerCase() === 'percentage' && Number(discount_value) === 100) {
        freeGoodsQuantity = totalQuantity;
      } else if (discount_type.toLowerCase() === 'fixed_amount') {
        if (totalQuantity > 1) {
          const possibleFreeGoods = Math.floor(Number(discount_value) / Number(product_variant_price));
          if (possibleFreeGoods >= 1) freeGoodsQuantity = possibleFreeGoods;
        } else {
          if (Number(product_variant_price) === Number(discount_value)) {
            freeGoodsQuantity = totalQuantity;
          }
        }
      }
    }
    finalObject['freeGoodsQuantity'] = freeGoodsQuantity;
    finalObject['totalQuantity'] = totalQuantity;
    finalObject['salesQuantity'] = totalQuantity - freeGoodsQuantity;

    const discountPercentage = discount_value ? Number(discount_value) : 0;
    finalObject['discount'] = round(discountPercentage);

    if (product_variant_price) {
      const price = Number(product_variant_price);
      finalObject['grossPriceCurrency'] = round(price);
      finalObject['grossPrice'] = round(price);
    }

    if (product_variant_price && finalObject['totalQuantity']) {
      finalObject['totalGrossWithoutVAT'] = round(Number(product_variant_price) * Number(finalObject['totalQuantity']));
    } else {
      finalObject['totalGrossWithoutVAT'] = 0;
    }

    if (finalObject['totalGrossWithoutVAT']) {
      finalObject['totalGrossWithVAT'] = round(Number(finalObject['totalGrossWithoutVAT']) * (1 + (finalObject['vatRate'] / 100)));
    }

    const orderLevelDiscount = order_level_discounts ? Number(order_level_discounts) : 0;
    finalObject['salesDeductionForFreeGoods'] = round(orderLevelDiscount);

    if (finalObject['totalGrossWithoutVAT']) {
      finalObject['grossWithoutVAT'] = round(Number(finalObject['totalGrossWithoutVAT']) + orderLevelDiscount);
    } else {
      finalObject['grossWithoutVAT'] = 0;
    }

    if (net_sales) {
      finalObject['net'] = round(Number(net_sales));
    } else if (discountPercentage === 100 && totalQuantity > 0) {
      finalObject['net'] = 0;
    } else if (finalObject['grossWithoutVAT']) {
      finalObject['net'] = round(Number(finalObject['grossWithoutVAT']));
    } else {
      finalObject['net'] = 0;
    }
  }

  return finalObject;
};
