import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
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

const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

export default Attendance;