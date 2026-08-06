import mongoose from 'mongoose';

const completionItemSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    done: { type: Boolean, default: false },
    completedBy: { type: String, default: '' },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

// One document per template per calendar day. Created on-demand (see
// checklistsController.getToday) the first time anyone loads that day's
// checklists, with items copied from the template at that moment.
const checklistCompletionSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChecklistTemplate', required: true },
    templateName: { type: String, required: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    items: [completionItemSchema],
  },
  { timestamps: true }
);

checklistCompletionSchema.index({ restaurantId: 1, locationId: 1, templateId: 1, date: 1 }, { unique: true });
checklistCompletionSchema.index({ restaurantId: 1, locationId: 1, date: 1 });

export default mongoose.model('ChecklistCompletion', checklistCompletionSchema);
