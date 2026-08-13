import Plan from '../models/Plan.js';

// Read-only, for any logged-in staff member — pricing is not sensitive, and
// this is what renders the plan comparison on the Contact Us page. Only
// active plans are listed; a deprecated plan a restaurant still happens to
// be on isn't hidden from them elsewhere (their own enabledPages/planName
// are unaffected), it just stops being offered to switch into.
export async function listActivePlans(req, res) {
  const plans = await Plan.find({ isActive: true })
    .sort({ sortOrder: 1, createdAt: 1 })
    .select('name slug priceMonthly priceAnnual perLocationPrice pages sortOrder')
    .lean();

  res.json({
    plans: plans.map((p) => ({
      id: p._id,
      name: p.name,
      slug: p.slug,
      priceMonthly: p.priceMonthly,
      priceAnnual: p.priceAnnual,
      perLocationPrice: p.perLocationPrice,
      pages: p.pages,
      sortOrder: p.sortOrder,
    })),
  });
}
