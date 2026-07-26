import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

// Import Mongoose Models
import Inventory from './models/Inventory.js';
import MenuItem from './models/MenuItem.js';
import Table from './models/Table.js';
import Order from './models/Order.js';
import Attendance from './models/Attendance.js';
import User from './models/User.js';

// --- INLINE MODEL FOR STOCK HISTORY ---
const stockHistorySchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: 'units' },
  performedBy: { type: String, default: 'Anonymous' },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

const StockHistory = mongoose.models.StockHistory || mongoose.model('StockHistory', stockHistorySchema);

const app = express();
app.use(cors());
app.use(express.json());

// --- MONGODB CONNECTION ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://23prakashmul_db_user:nWs0IreBvx99oszR@restaurantcluster.n9prbef.mongodb.net';

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB!');
    await seedInitialData();
  })
  .catch((err) => console.error('MongoDB Connection Error:', err));

// --- SEED DEFAULT DATA IF DATABASE IS EMPTY ---
async function seedInitialData() {
  try {
    const invCount = await Inventory.countDocuments();
    if (invCount === 0) {
      console.log('Seeding initial inventory...');
      const invItems = await Inventory.insertMany([
        { name: 'Potato Fries (Bulk)', totalQuantity: 10, unit: 'kg', costPerUnit: 2.50 },
        { name: 'Wagyu Beef Patties', totalQuantity: 50, unit: 'units', costPerUnit: 4.00 },
        { name: 'Pizza Dough & Cheese', totalQuantity: 30, unit: 'units', costPerUnit: 3.00 },
        { name: 'Craft IPA Keg', totalQuantity: 50, unit: 'liters', costPerUnit: 2.00 },
        { name: 'Pasta Noodles & Sauce', totalQuantity: 15, unit: 'kg', costPerUnit: 3.50 },
        { name: 'Chicken Wings (Bulk)', totalQuantity: 20, unit: 'kg', costPerUnit: 5.00 },
        { name: 'Chocolate Cake Portion', totalQuantity: 25, unit: 'units', costPerUnit: 2.00 },
        { name: 'Fresh Lemons (Juice)', totalQuantity: 10, unit: 'kg', costPerUnit: 1.50 },
      ]);

      const invMap = {};
      invItems.forEach((item) => {
        invMap[item.name] = item._id.toString();
      });

      console.log('Seeding initial menu items...');
      await MenuItem.insertMany([
        { sku: 'KIT-BRG-01', name: 'Truffle Wagyu Burger', category: 'Mains', price: 18.99, recipe: { inventoryItemId: invMap['Wagyu Beef Patties'], quantityPerPortion: 1 } },
        { sku: 'KIT-PST-01', name: 'Wild Mushroom Rigatoni', category: 'Mains', price: 16.50, recipe: { inventoryItemId: invMap['Pasta Noodles & Sauce'], quantityPerPortion: 0.25 } },
        { sku: 'KIT-PZA-01', name: 'Wood-Fired Pizza', category: 'Mains', price: 14.99, recipe: { inventoryItemId: invMap['Pizza Dough & Cheese'], quantityPerPortion: 1 } },
        { sku: 'BAR-BEER-01', name: 'Craft IPA Pint', category: 'Beverages', price: 7.50, recipe: { inventoryItemId: invMap['Craft IPA Keg'], quantityPerPortion: 0.5 } },
        { sku: 'KIT-APP-01', name: 'Crispy French Fries', category: 'Starters', price: 6.50, recipe: { inventoryItemId: invMap['Potato Fries (Bulk)'], quantityPerPortion: 0.2 } },
        { sku: 'KIT-APP-02', name: 'Spicy Buffalo Wings', category: 'Starters', price: 11.00, recipe: { inventoryItemId: invMap['Chicken Wings (Bulk)'], quantityPerPortion: 0.3 } },
        { sku: 'DES-CAK-01', name: 'Lava Cake', category: 'Desserts', price: 8.50, recipe: { inventoryItemId: invMap['Chocolate Cake Portion'], quantityPerPortion: 1 } },
        { sku: 'BAR-LEMO-01', name: 'Fresh Lemonade', category: 'Beverages', price: 4.50, recipe: { inventoryItemId: invMap['Fresh Lemons (Juice)'], quantityPerPortion: 0.15 } },
        { sku: 'KIT-BRG-02', name: 'Classic Cheeseburger', category: 'Mains', price: 13.99, recipe: { inventoryItemId: invMap['Wagyu Beef Patties'], quantityPerPortion: 1 } },
        { sku: 'KIT-APP-03', name: 'Loaded Cheese Fries', category: 'Starters', price: 8.99, recipe: { inventoryItemId: invMap['Potato Fries (Bulk)'], quantityPerPortion: 0.25 } },
        { sku: 'DES-CAK-02', name: 'Brownie Sundae', category: 'Desserts', price: 7.99, recipe: { inventoryItemId: invMap['Chocolate Cake Portion'], quantityPerPortion: 1 } },
        { sku: 'BAR-BEER-02', name: 'Draft Lager', category: 'Beverages', price: 6.00, recipe: { inventoryItemId: invMap['Craft IPA Keg'], quantityPerPortion: 0.5 } },
      ]);
    }

    const tblCount = await Table.countDocuments();
    if (tblCount === 0) {
      console.log('Seeding initial tables...');
      await Table.insertMany([
        { number: 1, status: 'available', seats: 2 },
        { number: 2, status: 'available', seats: 4 },
        { number: 3, status: 'available', seats: 4 },
        { number: 4, status: 'available', seats: 6 },
      ]);
    }
  } catch (err) {
    console.error('Data seeding failed:', err);
  }
}

// --- API ENDPOINTS ---

// GET Menu & Inventory
app.get('/api/menu', async (req, res) => {
  const menuItems = await MenuItem.find();
  res.json(menuItems);
});

app.get('/api/inventory', async (req, res) => {
  const inventory = await Inventory.find();
  res.json(inventory);
});

// RESTAURANT TABLES CRUD
app.get('/api/tables', async (req, res) => {
  const tables = await Table.find();
  res.json(tables);
});

app.post('/api/tables', async (req, res) => {
  const newTable = new Table({
    number: parseInt(req.body.number, 10),
    status: 'available',
    seats: parseInt(req.body.seats, 10) || 4,
  });
  await newTable.save();
  res.status(201).json(newTable);
});

app.put('/api/tables/:id', async (req, res) => {
  const updatedTable = await Table.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (updatedTable) {
    res.json(updatedTable);
  } else {
    res.status(404).json({ message: 'Table not found' });
  }
});

app.delete('/api/tables/:id', async (req, res) => {
  await Table.findByIdAndDelete(req.params.id);
  res.json({ message: 'Table deleted successfully' });
});

// ORDERS & PAYMENT
app.get('/api/orders', async (req, res) => {
  const orders = await Order.find();
  res.json(orders);
});

app.post('/api/orders/save', async (req, res) => {
  const { tableId, items } = req.body;
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  let existingOrder = await Order.findOne({ tableId, status: 'pending' });

  if (existingOrder) {
    existingOrder.items = items;
    existingOrder.subtotal = subtotal;
    existingOrder.tax = tax;
    existingOrder.total = total;
    existingOrder.remainingBalance = total;
    await existingOrder.save();
    res.json(existingOrder);
  } else {
    const newOrder = new Order({
      tableId,
      items,
      status: 'pending',
      subtotal,
      tax,
      total,
      remainingBalance: total,
    });
    await newOrder.save();

    await Table.findByIdAndUpdate(tableId, { status: 'occupied' });
    res.status(201).json(newOrder);
  }
});

// PAY BILL AND REDUCE INVENTORY STOCK
app.post('/api/orders/:orderId/pay', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentMethod = 'cash' } = req.body;
    const order = await Order.findById(orderId);

    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status === 'paid') return res.status(400).json({ message: 'Order is already paid' });

    // Deduct inventory stock
    const allMenuItems = await MenuItem.find();
    for (const orderItem of order.items) {
      const menuItem = allMenuItems.find((m) => m.id === orderItem.menuItemId || m._id.toString() === orderItem.menuItemId);
      if (menuItem && menuItem.recipe && menuItem.recipe.inventoryItemId) {
        const invItem = await Inventory.findById(menuItem.recipe.inventoryItemId);
        if (invItem) {
          const totalDeduction = menuItem.recipe.quantityPerPortion * orderItem.quantity;
          invItem.totalQuantity = Math.max(0, invItem.totalQuantity - totalDeduction);
          await invItem.save();

          // Log POS Sale deduction to history
          await StockHistory.create({
            itemId: invItem._id,
            itemName: invItem.name,
            quantity: -totalDeduction,
            unit: invItem.unit,
            performedBy: 'POS System',
            description: `Auto-deducted for Order #${order._id.toString().slice(-4)}`,
          });
        }
      }
    }

    order.status = 'paid';
    order.paymentMethod = paymentMethod;
    order.remainingBalance = 0;
    order.paidAt = new Date();
    await order.save();

    await Table.findByIdAndUpdate(order.tableId, { status: 'available' });

    const updatedInventory = await Inventory.find();
    res.json({ message: 'Bill paid & stock deducted successfully', order, inventory: updatedInventory });
  } catch (err) {
    console.error('Error processing payment:', err);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// PROCESS ORDER AS FULL CREDIT
app.post('/api/orders/:orderId/credit', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { customerName, customerPhone } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Deduct stock when adding to credit
    const allMenuItems = await MenuItem.find();
    for (const orderItem of order.items) {
      const menuItem = allMenuItems.find((m) => m.id === orderItem.menuItemId || m._id.toString() === orderItem.menuItemId);
      if (menuItem && menuItem.recipe && menuItem.recipe.inventoryItemId) {
        const invItem = await Inventory.findById(menuItem.recipe.inventoryItemId);
        if (invItem) {
          const totalDeduction = menuItem.recipe.quantityPerPortion * orderItem.quantity;
          invItem.totalQuantity = Math.max(0, invItem.totalQuantity - totalDeduction);
          await invItem.save();

          // Log Credit Order deduction to history
          await StockHistory.create({
            itemId: invItem._id,
            itemName: invItem.name,
            quantity: -totalDeduction,
            unit: invItem.unit,
            performedBy: 'POS System (Credit)',
            description: `Auto-deducted for Credit Order #${order._id.toString().slice(-4)}`,
          });
        }
      }
    }

    order.status = 'credit';
    order.paymentMethod = 'credit';
    order.customerName = customerName || 'Walk-in Customer';
    order.customerPhone = customerPhone || 'N/A';
    order.remainingBalance = order.total;
    await order.save();

    await Table.findByIdAndUpdate(order.tableId, { status: 'available' });

    res.json({ message: 'Order recorded to Credit Ledger successfully', order });
  } catch (err) {
    console.error('Error processing credit order:', err);
    res.status(500).json({ error: 'Failed to process credit order' });
  }
});

// PARTIAL CREDIT PAYMENT
app.post('/api/orders/credit/partial-pay', async (req, res) => {
  try {
    const { customerPhone, customerName, amount, note } = req.body;
    const payAmount = Number(amount);

    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ message: 'Invalid payment amount' });
    }

    const query = {
      status: { $in: ['credit', 'unsettled'] },
      $or: [
        { customerPhone: customerPhone },
        { customerName: customerName }
      ]
    };

    const creditOrders = await Order.find(query).sort({ createdAt: 1 });

    if (creditOrders.length === 0) {
      return res.status(404).json({ message: 'No active credit orders found for this customer' });
    }

    let remainingToDeduct = payAmount;

    for (const order of creditOrders) {
      if (remainingToDeduct <= 0) break;

      const currentBalance = order.remainingBalance ?? order.total;

      if (remainingToDeduct >= currentBalance) {
        remainingToDeduct -= currentBalance;
        order.remainingBalance = 0;
        order.status = 'settled';
        order.paidAt = new Date();
        order.paymentHistory.push({
          amount: currentBalance,
          note: note || 'Partial payment auto-settled order',
          type: 'full'
        });
      } else {
        order.remainingBalance = currentBalance - remainingToDeduct;
        order.paymentHistory.push({
          amount: remainingToDeduct,
          note: note || 'Partial payment received',
          type: 'partial'
        });
        remainingToDeduct = 0;
      }

      await order.save();
    }

    res.json({ message: 'Partial payment applied successfully' });
  } catch (err) {
    console.error('Error applying partial payment:', err);
    res.status(500).json({ error: 'Failed to apply partial payment' });
  }
});

// FULL CREDIT SETTLEMENT FOR A CUSTOMER
app.post('/api/orders/credit/full-settle', async (req, res) => {
  try {
    const { customerPhone, customerName } = req.body;

    const query = {
      status: { $in: ['credit', 'unsettled'] },
      $or: [
        { customerPhone: customerPhone },
        { customerName: customerName }
      ]
    };

    const creditOrders = await Order.find(query);

    for (const order of creditOrders) {
      const remaining = order.remainingBalance ?? order.total;
      order.remainingBalance = 0;
      order.status = 'settled';
      order.paidAt = new Date();
      order.paymentHistory.push({
        amount: remaining,
        note: 'Marked as Fully Settled',
        type: 'full'
      });
      await order.save();
    }

    res.json({ message: 'All credit orders fully settled successfully' });
  } catch (err) {
    console.error('Error settling credit orders:', err);
    res.status(500).json({ error: 'Failed to fully settle credit orders' });
  }
});

// GET CREDIT LEDGER DATA
app.get('/api/credits', async (req, res) => {
  try {
    const creditOrders = await Order.find({
      $or: [
        { paymentMethod: 'credit' },
        { status: { $in: ['credit', 'unsettled', 'settled'] } }
      ]
    });

    const customerMap = {};

    creditOrders.forEach((order) => {
      const key = order.customerPhone && order.customerPhone !== 'N/A' 
        ? order.customerPhone 
        : order.customerName;

      if (!customerMap[key]) {
        customerMap[key] = {
          id: key,
          name: order.customerName,
          phone: order.customerPhone,
          ordersCount: 0,
          debtOwed: 0,
          originalAmount: 0,
          isFullySettled: true,
          notesHistory: [],
          orderIds: []
        };
      }

      const remBalance = order.remainingBalance ?? order.total;

      customerMap[key].ordersCount += 1;
      customerMap[key].debtOwed += remBalance;
      customerMap[key].originalAmount += order.total;
      customerMap[key].orderIds.push(order._id);

      if (remBalance > 0 && order.status !== 'settled') {
        customerMap[key].isFullySettled = false;
      }

      if (order.paymentHistory && order.paymentHistory.length > 0) {
        order.paymentHistory.forEach((log) => {
          const dateStr = new Date(log.createdAt).toLocaleDateString();
          customerMap[key].notesHistory.push(
            `Paid Rs. ${log.amount.toLocaleString()} on ${dateStr}${log.note ? ` (${log.note})` : ''}`
          );
        });
      }
    });

    res.json(Object.values(customerMap));
  } catch (err) {
    console.error('Error fetching credit ledger:', err);
    res.status(500).json({ error: 'Failed to fetch credit ledger' });
  }
});

// CANCEL / CLEAR PENDING ORDER FOR A TABLE
app.delete('/api/orders/table/:tableId', async (req, res) => {
  const { tableId } = req.params;

  await Order.deleteMany({ tableId, status: 'pending' });
  await Table.findByIdAndUpdate(tableId, { status: 'available' });

  res.json({ message: 'Pending order cancelled successfully' });
});

// UPDATE INVENTORY (Restock or Deduct with History Logging)
app.patch('/api/inventory/:id/restock', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Read quantity from either req.body.quantity or req.body.addQuantity
    const rawQty = req.body.quantity !== undefined ? req.body.quantity : req.body.addQuantity;
    const { performedBy, description } = req.body;

    const qtyToChange = parseFloat(rawQty);

    if (isNaN(qtyToChange) || qtyToChange === 0) {
      return res.status(400).json({ message: 'Invalid quantity value' });
    }

    const item = await Inventory.findById(id);
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    // Safely adjust quantity (allow positive or negative)
    item.totalQuantity = (Number(item.totalQuantity) || 0) + qtyToChange;
    await item.save();

    // Create Audit Log Entry
    await StockHistory.create({
      itemId: item._id,
      itemName: item.name,
      quantity: qtyToChange,
      unit: item.unit,
      performedBy: performedBy || 'Anonymous',
      description: description || (qtyToChange > 0 ? 'Manual Restock' : 'Manual Deduction'),
    });

    res.json(item);
  } catch (err) {
    console.error('Error updating inventory:', err);
    res.status(500).json({ error: 'Failed to update inventory stock' });
  }
});

// GET STOCK HISTORY LOGS
app.get('/api/inventory/history', async (req, res) => {
  try {
    const logs = await StockHistory.find().sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) {
    console.error('Error fetching stock history:', err);
    res.status(500).json({ error: 'Failed to fetch stock history' });
  }
});

// DELETE SPECIFIC ORDER BY ID
app.delete('/api/orders/:id', async (req, res) => {
  await Order.findByIdAndDelete(req.params.id);
  res.json({ message: 'Order deleted successfully' });
});


// --- ATTENDANCE ENDPOINTS ---

// GET Attendance History
app.get('/api/attendance', async (req, res) => {
  try {
    const records = await Attendance.find().sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    console.error('Error fetching attendance history:', err);
    res.status(500).json({ error: 'Failed to fetch attendance history' });
  }
});

// CREATE / SAVE Attendance Record
app.post('/api/attendance', async (req, res) => {
  try {
    const { employeeName, checkInTime, checkOutTime, duration, status } = req.body;

    const newAttendance = new Attendance({
      employeeName,
      checkInTime,
      checkOutTime,
      duration,
      status,
    });

    await newAttendance.save();
    res.status(201).json(newAttendance);
  } catch (err) {
    console.error('Error saving attendance record:', err);
    res.status(500).json({ error: 'Failed to save attendance record' });
  }
});

// --- AUTHENTICATION ENDPOINTS ---

// REGISTER USER
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    const newUser = new User({
      name,
      email,
      password,
      role: 'Staff',
    });

    await newUser.save();

    res.status(201).json({
      message: 'Account created successfully!',
      user: { name: newUser.name, email: newUser.email, role: newUser.role },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// LOGIN USER (ADDED)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });

    if (!user || user.password !== password) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    res.status(200).json({
      message: 'Login successful',
      user: {
        name: user.name,
        email: user.email,
        role: user.role || 'Staff',
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

app.listen(5000, () => console.log('Nexus POS Server running on http://localhost:5000'));