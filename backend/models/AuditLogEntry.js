import mongoose from 'mongoose';

// A human-readable "who did what" trail for sensitive changes — the same
// idea StockHistory already applies to stock movements, extended to staff,
// tables, categories, menu, credits, orders, and procurement. Stock
// movements themselves stay in StockHistory rather than being duplicated
// here, since that's already a complete audit trail for that one domain.
const auditLogEntrySchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    // Null for organization-wide actions (e.g. deleting a shared menu item);
    // set for actions tied to one location (e.g. deleting a table).
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
    actorName: { type: String, required: true },
    actorEmail: { type: String, required: true },
    action: { type: String, required: true },
  },
  { timestamps: true }
);

auditLogEntrySchema.index({ restaurantId: 1, createdAt: -1 });

export default mongoose.model('AuditLogEntry', auditLogEntrySchema);
