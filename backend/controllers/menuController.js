import Category from '../models/Category.js';
import MenuItem from '../models/MenuItem.js';
import Order from '../models/Order.js';
import { parsePagination, paginatedResponse } from '../utils/pagination.js';
import { emitChange } from '../realtime/socket.js';

export async function listMenu(req, res) {
  try {
    const pagination = parsePagination(req);
    if (!pagination) {
      const menuItems = await MenuItem.find();
      return res.json(menuItems);
    }
    const [data, total] = await Promise.all([
      MenuItem.find().sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
      MenuItem.countDocuments(),
    ]);
    res.json(paginatedResponse(data, total, pagination));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
}

export async function createMenuItem(req, res) {
  try {
    const { name, category, price, recipe, sku } = req.body;

    // Auto-ensure category exists in Category collection
    const categoryName = category.trim();
    const catExists = await Category.findOne({ name: categoryName });
    if (!catExists) {
      await Category.create({ name: categoryName });
    }

    const newItem = new MenuItem({
      name: name.trim(),
      category: categoryName,
      price: parseFloat(price),
      sku: sku || `SKU-${Date.now().toString().slice(-6)}`,
      recipe: Array.isArray(recipe) ? recipe : recipe ? [recipe] : [],
    });

    const savedItem = await newItem.save();
    emitChange('menu');
    res.status(201).json(savedItem);
  } catch (err) {
    req.log.error({ err }, 'Error creating menu item');
    res.status(500).json({ error: 'Failed to create menu item: ' + err.message });
  }
}

export async function deleteMenuItem(req, res) {
  try {
    const { id } = req.params;

    const inActiveCart = await Order.exists({ status: 'pending', 'items.menuItemId': id });
    if (inActiveCart) {
      return res.status(400).json({
        message: 'Cannot delete this item because it is in an active pending order.',
      });
    }

    const deleted = await MenuItem.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Menu item not found' });
    }
    emitChange('menu');
    res.json({ message: 'Menu item deleted successfully' });
  } catch (err) {
    req.log.error({ err }, 'Error deleting menu item');
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
}
