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
  try {
    const menuItems = await MenuItem.find();
    res.json(menuItems);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// CREATE NEW MENU ITEM IN MONGODB
app.post('/api/menu', async (req, res) => {
  try {
    const { name, category, price, recipe, sku } = req.body;

    if (!name || !category || price === undefined) {
      return res.status(400).json({ message: 'Name, category, and price are required.' });
    }

    const newItem = new MenuItem({
      name: name.trim(),
      category: category.trim(),
      price: parseFloat(price),
      sku: sku || `SKU-${Date.now().toString().slice(-6)}`,
      recipe: Array.isArray(recipe) ? recipe : recipe ? [recipe] : [],
    });

    const savedItem = await newItem.save();
    res.status(201).json(savedItem);
  } catch (err) {
    console.error('Error creating menu item:', err);
    res.status(500).json({ error: 'Failed to create menu item: ' + err.message });
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    const inventory = await Inventory.find();
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// CREATE A NEW INVENTORY ITEM & LOG INITIAL STOCK MOVEMENT
app.post('/api/inventory', async (req, res) => {
  try {
    const { name, totalQuantity, unit, costPerUnit, performedBy, description } = req.body;

    const qty = parseFloat(totalQuantity);
    const cost = parseFloat(costPerUnit);

    if (!name || isNaN(qty) || !unit) {
      return res.status(400).json({ message: 'Missing required fields (name, totalQuantity, or unit)' });
    }

    const newItem = new Inventory({
      name: name.trim(),
      totalQuantity: qty,
      unit: unit.trim(),
      costPerUnit: isNaN(cost) ? 0 : cost,
    });
    
    const savedItem = await newItem.save();

    await StockHistory.create({
      itemId: savedItem._id,
      itemName: savedItem.name,
      quantity: qty,
      unit: savedItem.unit,
      performedBy: performedBy || 'Anonymous',
      description: description || 'Initial stock creation',
    });

    res.status(201).json(savedItem);
  } catch (err) {
    console.error('Error creating inventory item:', err);
    res.status(500).json({ error: 'Failed to create inventory item: ' + err.message });
  }
});

// RESTAURANT TABLES CRUD
app.get('/api/tables', async (req, res) => {
  try {
    const tables = await Table.find();
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

app.post('/api/tables', async (req, res) => {
  try {
    const newTable = new Table({
      number: parseInt(req.body.number, 10),
      status: 'available',
      seats: parseInt(req.body.seats, 10) || 4,
    });
    await newTable.save();
    res.status(201).json(newTable);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create table' });
  }
});

app.put('/api/tables/:id', async (req, res) => {
  try {
    const updatedTable = await Table.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (updatedTable) {
      res.json(updatedTable);
    } else {
      res.status(404).json({ message: 'Table not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update table' });
  }
});

app.delete('/api/tables/:id', async (req, res) => {
  try {
    await Table.findByIdAndDelete(req.params.id);
    res.json({ message: 'Table deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete table' });
  }
});

// ORDERS & PAYMENT
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// --- ROBUST SAVE ORDER ENDPOINT ---
app.post('/api/orders/save', async (req, res) => {
  try {
    const { tableId, items } = req.body;

    if (!tableId) {
      return res.status(400).json({ error: 'tableId is required' });
    }

    // 1. Resolve Table whether tableId is a Mongoose ObjectId or a Table Number
    let table = null;
    if (mongoose.Types.ObjectId.isValid(tableId)) {
      table = await Table.findById(tableId);
    }
    if (!table && !isNaN(Number(tableId))) {
      table = await Table.findOne({ number: Number(tableId) });
    }

    if (!table) {
      return res.status(400).json({ error: `Table not found for identifier: ${tableId}` });
    }

    const validTableId = table._id;

    // 2. Format and sanitize item details
    const formattedItems = (items || []).map((item) => ({
      menuItemId: String(item.menuItemId || item.id || item._id || ''),
      name: item.name || 'Unnamed Item',
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 1,
    }));

    const subtotal = formattedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = subtotal * 0.08;
    const total = subtotal + tax;

    // 3. Find active pending order for this table
    let existingOrder = await Order.findOne({ tableId: validTableId, status: 'pending' });

    if (existingOrder) {
      existingOrder.items = formattedItems;
      existingOrder.subtotal = subtotal;
      existingOrder.tax = tax;
      existingOrder.total = total;
      existingOrder.remainingBalance = total;
      await existingOrder.save();
      console.log(`[Order Save] Updated pending order ID: ${existingOrder._id} for Table ${table.number}`);
      return res.json(existingOrder);
    } else {
      const newOrder = new Order({
        tableId: validTableId,
        items: formattedItems,
        status: 'pending',
        subtotal,
        tax,
        total,
        remainingBalance: total,
      });
      await newOrder.save();

      await Table.findByIdAndUpdate(validTableId, { status: 'occupied' });
      console.log(`[Order Save] Created NEW pending order ID: ${newOrder._id} for Table ${table.number}`);
      return res.status(201).json(newOrder);
    }
  } catch (err) {
    console.error('SERVER ERROR DURING ORDER SAVE:', err);
    return res.status(500).json({ error: 'Failed to save order: ' + err.message });
  }
});

// Helper for deducting stock during checkout
async function deductStockForOrder(order, performedByTag) {
  const allMenuItems = await MenuItem.find();
  for (const orderItem of order.items) {
    const menuItem = allMenuItems.find(
      (m) => m.id === orderItem.menuItemId || m._id.toString() === orderItem.menuItemId
    );

    if (menuItem && Array.isArray(menuItem.recipe)) {
      for (const recipeIngredient of menuItem.recipe) {
        if (!recipeIngredient.inventoryItemId) continue;

        const invItem = await Inventory.findById(recipeIngredient.inventoryItemId);
        if (invItem) {
          const totalDeduction = recipeIngredient.quantityPerPortion * orderItem.quantity;
          invItem.totalQuantity = Math.max(0, invItem.totalQuantity - totalDeduction);
          await invItem.save();

          await StockHistory.create({
            itemId: invItem._id,
            itemName: invItem.name,
            quantity: -totalDeduction,
            unit: invItem.unit,
            performedBy: performedByTag,
            description: `Auto-deducted for Order #${order._id.toString().slice(-4)}`,
          });
        }
      }
    }
  }
}

// PAY BILL AND REDUCE INVENTORY STOCK
app.post('/api/orders/:orderId/pay', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentMethod = 'cash' } = req.body;
    const order = await Order.findById(orderId);

    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status === 'paid') return res.status(400).json({ message: 'Order is already paid' });

    await deductStockForOrder(order, 'POS System');

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

    await deductStockForOrder(order, 'POS System (Credit)');

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
      $or: [{ customerPhone: customerPhone }, { customerName: customerName }],
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
          type: 'full',
        });
      } else {
        order.remainingBalance = currentBalance - remainingToDeduct;
        order.paymentHistory.push({
          amount: remainingToDeduct,
          note: note || 'Partial payment received',
          type: 'partial',
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
      $or: [{ customerPhone: customerPhone }, { customerName: customerName }],
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
        type: 'full',
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
      $or: [{ paymentMethod: 'credit' }, { status: { $in: ['credit', 'unsettled', 'settled'] } }],
    });

    const customerMap = {};

    creditOrders.forEach((order) => {
      const key =
        order.customerPhone && order.customerPhone !== 'N/A' ? order.customerPhone : order.customerName;

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
          orderIds: [],
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
  try {
    const { tableId } = req.params;
    let table = null;

    if (mongoose.Types.ObjectId.isValid(tableId)) {
      table = await Table.findById(tableId);
    }
    if (!table && !isNaN(Number(tableId))) {
      table = await Table.findOne({ number: Number(tableId) });
    }

    const targetTableId = table ? table._id : tableId;

    await Order.deleteMany({ tableId: targetTableId, status: 'pending' });
    if (table) {
      table.status = 'available';
      await table.save();
    }

    res.json({ message: 'Pending order cancelled successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel pending order' });
  }
});

// UPDATE INVENTORY (Restock or Deduct with History Logging)
app.patch('/api/inventory/:id/restock', async (req, res) => {
  try {
    const { id } = req.params;

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

    item.totalQuantity = (Number(item.totalQuantity) || 0) + qtyToChange;
    await item.save();

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
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// --- ATTENDANCE ENDPOINTS ---

app.get('/api/attendance', async (req, res) => {
  try {
    const records = await Attendance.find().sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    console.error('Error fetching attendance history:', err);
    res.status(500).json({ error: 'Failed to fetch attendance history' });
  }
});

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