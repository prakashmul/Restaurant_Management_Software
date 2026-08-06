import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
  employeeName: { type: String, required: true },
  checkInTime: { type: String, required: true },
  checkOutTime: { type: String, default: null },
  duration: { type: String, default: '00:00:00' },
  status: {
    type: String,
    enum: ['Completed', 'Auto-Checked Out', 'Active'],
    default: 'Active'
  },
  createdAt: { type: Date, default: Date.now }
});

attendanceSchema.index({ restaurantId: 1, locationId: 1, createdAt: -1 });

const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

export default Attendance;