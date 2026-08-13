import mongoose from 'mongoose';
import Restaurant from '../models/Restaurant.js';
import User from '../models/User.js';
import StaffMembership from '../models/StaffMembership.js';
import Location from '../models/Location.js';
import Category from '../models/Category.js';
import MenuItem from '../models/MenuItem.js';
import Inventory from '../models/Inventory.js';
import Stock from '../models/Stock.js';
import StockHistory from '../models/StockHistory.js';
import Table from '../models/Table.js';
import Order from '../models/Order.js';
import Customer from '../models/Customer.js';
import Attendance from '../models/Attendance.js';
import Shift from '../models/Shift.js';
import ChecklistTemplate from '../models/ChecklistTemplate.js';
import ChecklistCompletion from '../models/ChecklistCompletion.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Vendor from '../models/Vendor.js';
import Transfer from '../models/Transfer.js';
import AuditLogEntry from '../models/AuditLogEntry.js';
import Role from '../models/Role.js';
import Expense from '../models/Expense.js';
import Reservation from '../models/Reservation.js';

// Every model that carries a restaurantId — deleted wholesale when a
// restaurant is removed. Keep this in sync with any new restaurantId-scoped
// model; a model left off this list would silently orphan data instead of
// erroring, so when adding a new tenant-scoped collection, add it here too.
const RESTAURANT_SCOPED_MODELS = [
  StaffMembership,
  Location,
  Category,
  MenuItem,
  Inventory,
  Stock,
  StockHistory,
  Table,
  Order,
  Customer,
  Attendance,
  Shift,
  ChecklistTemplate,
  ChecklistCompletion,
  PurchaseOrder,
  Vendor,
  Transfer,
  AuditLogEntry,
  Role,
  Expense,
  Reservation,
];

// Deletes a restaurant and every document scoped to it. A User is only
// deleted if this was their last StaffMembership anywhere — someone staffing
// two restaurants keeps their login after one of them is removed. Deleting
// a User whose only tie was this restaurant is what lets the same email
// register a brand-new restaurant afterward (register() rejects an email
// already in the User collection).
export async function deleteRestaurantCascade(restaurantId) {
  const session = await mongoose.startSession();
  try {
    let deletedCounts = {};
    let deletedUserCount = 0;

    await session.withTransaction(async () => {
      const memberships = await StaffMembership.find({ restaurantId }).select('userId').session(session);
      const candidateUserIds = [...new Set(memberships.map((m) => m.userId.toString()))];

      for (const model of RESTAURANT_SCOPED_MODELS) {
        const result = await model.deleteMany({ restaurantId }, { session });
        deletedCounts[model.modelName] = result.deletedCount;
      }

      await Restaurant.deleteOne({ _id: restaurantId }, { session });

      for (const userId of candidateUserIds) {
        const remaining = await StaffMembership.countDocuments({ userId }).session(session);
        if (remaining === 0) {
          await User.deleteOne({ _id: userId }, { session });
          deletedUserCount += 1;
        }
      }
    });

    return { deletedCounts, deletedUserCount };
  } finally {
    session.endSession();
  }
}
