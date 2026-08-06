import mongoose from 'mongoose';

// staffName/role are a snapshot at scheduling time (not a live populate) so a
// shift keeps its meaning even if the staff member is later renamed, has
// their role changed, or is removed from the restaurant. staffName also
// matches Attendance.employeeName's free-text convention on purpose — see
// schedulingController.getVariance, which joins planned vs. actual hours by
// name because Attendance predates this feature and has no staff-member id.
const shiftSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    staffMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffMembership', required: true },
    staffName: { type: String, required: true },
    role: { type: String, required: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    startTime: { type: String, required: true }, // 'HH:MM', 24h
    endTime: { type: String, required: true },
  },
  { timestamps: true }
);

shiftSchema.index({ restaurantId: 1, locationId: 1, date: 1 });

export default mongoose.model('Shift', shiftSchema);
