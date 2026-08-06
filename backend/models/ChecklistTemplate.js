import mongoose from 'mongoose';

// A reusable list of tasks (e.g. "Opening Checklist") that a restaurant
// expects staff to complete once per day. Editing a template only affects
// completions created after the edit — see ChecklistCompletion, which snapshots
// item text at creation time.
const checklistTemplateSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    name: { type: String, required: true, trim: true },
    items: [{ text: { type: String, required: true, trim: true } }],
  },
  { timestamps: true }
);

checklistTemplateSchema.index({ restaurantId: 1 });

export default mongoose.model('ChecklistTemplate', checklistTemplateSchema);
