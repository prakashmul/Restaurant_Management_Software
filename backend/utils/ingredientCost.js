// Shared by every report that needs "what does this dish cost to make right
// now" — Recipe Costing, Head Office, and the Dashboard's Gross/Net Profit
// cards. Live-computed from the menu item's current recipe and each
// ingredient's current cost, never a historical snapshot. inventoryCostById
// should map inventoryItemId -> costPerUnit, typically built from
// attachStockQuantities' output so cost resolves to whichever location the
// caller is scoped to. A dish whose recipe references a deleted or uncosted
// inventory item can't be fully costed, so it returns null rather than an
// understated number.
export function computeIngredientCost(menuItem, inventoryCostById) {
  if (!Array.isArray(menuItem.recipe) || menuItem.recipe.length === 0) return null;

  let cost = 0;
  for (const ingredient of menuItem.recipe) {
    const costPerUnit = inventoryCostById.get(ingredient.inventoryItemId?.toString());
    if (costPerUnit === undefined) return null;
    cost += ingredient.quantityPerPortion * costPerUnit;
  }
  return cost;
}
