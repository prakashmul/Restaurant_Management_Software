import mongoose from 'mongoose';

// A single operating-expense entry (rent, a utility bill, a payroll run,
// etc.) — feeds the Dashboard's Net Profit card (Gross Profit minus
// expenses in the selected date range). Location-scoped like Stock/Order,
// since costs like rent are genuinely per-branch, not org-wide.
const expenseSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    category: {
      type: String,
      enum: ['staff_salary', 'rent', 'electricity', 'water', 'miscellaneous', 'other'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    // The date the expense applies to (not necessarily when it was entered
    // into the system) — what date-range filtering and Net Profit both key
    // off of.
    date: { type: Date, required: true },
    note: { type: String, default: '' },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

expenseSchema.index({ restaurantId: 1, locationId: 1, date: -1 });

export default mongoose.model('Expense', expenseSchema);
