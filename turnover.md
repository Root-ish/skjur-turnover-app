# Het doel 
Elk kwartaal moeten alle orders van het vorige kwartaal worden opgehaald en worden omgezet naar een CSV bestand.
Er zijn twee bronnen, de Shopify bron en de bol.com bron.

## Shopify bron
Via de GraphQL API van Shopify kunnen we de orders van het vorige kwartaal ophalen.
De query is "query getMonthlyTurnover($shopQuery: String!) {
  shopifyqlQuery(query: $shopQuery) {
    tableData {
      rows
    }
  }
}" en de variables is "{
  "shopQuery": "FROM sales SHOW gross_sales, product_variant_sku, product_title, quantity_ordered, net_sales, line_item_discounts, product_variant_price, order_level_discounts, day, discount_type, discount_value, gross_returns, quantity_returned WHERE product_title IS NOT NULL GROUP BY order_name, hour, product_variant_sku, product_title, discount_type, discount_value, product_variant_price, day, return_reason   DURING last_quarter ORDER BY order_name ASC VISUALIZE gross_sales"
}"

Deze output moet vervolgens worden geformat via de formatRow.js functie die je kunt vinden in het Skjur turnover api project.
Let er wel op dat de formatRow nog niet helemaal klaar is, geld moet worden uitgedrukt als normale nummers en mag geen "" bevatten.

## Bol.com bron
Hiervoor mag je alle files uit het skjur turnover api project gebruiken voor de bol.com integratie. Geef wel alles goed terug in de console wat er gebeurt. Dus als de validatie niet goed gaat laat je dat weten in de console.

## CSV bestanden
De CSV bestanden moeten worden opgeslagen in de csv folder.
De naam van de bestanden moet de volgende format hebben: "turnover_YYYY_QQ.csv"
Dit is een voorbeeld van hoe de CSV header er uit moet zien: "Invoice No,Date,Client Nr.,Client name,Distribution channel,Article Nr.,Article name,Sales quantity,Free goods quantity,Total quantity,Gross price currency,Currency,Exchange rate,Gross price,VAT,Total gross I without VAT,Total gross I with VAT,Sales deduction for free goods,Discount,Gross II without VAT,Cash discount,Net,Invoice reffering number"

Het CSV bestand moet uiteindelijk worden verstuurd naar de volgende webhook https://hook.eu2.make.com/5n6kq7g6v8wx54dl3evds61izkw1xqig
