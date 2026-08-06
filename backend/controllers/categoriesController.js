import mongoose from 'mongoose';
import Category from '../models/Category.js';
import MenuItem from '../models/MenuItem.js';
import { emitChange } from '../realtime/socket.js';
import { logAudit } from '../services/auditService.js';

export async function listCategories(req, res) {
  try {
    const categories = await Category.find({ restaurantId: req.restaurantId }).sort({ createdAt: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
}

export async function createCategory(req, res) {
  try {
    const { name } = req.body;

    const existingCat = await Category.findOne({ restaurantId: req.restaurantId, name: name.trim() });
    if (existingCat) {
      return res.status(200).json(existingCat);
    }

    const newCategory = new Category({ restaurantId: req.restaurantId, name: name.trim() });
    const savedCat = await newCategory.save();
    emitChange('category');
    res.status(201).json(savedCat);
  } catch (err) {
    req.log.error({ err }, 'Error creating category');
    res.status(500).json({ error: 'Failed to create category: ' + err.message });
  }
}

export async function deleteCategory(req, res) {
  try {
    const { id } = req.params;
    let targetCat = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      targetCat = await Category.findOne({ _id: id, restaurantId: req.restaurantId });
    }
    if (!targetCat) {
      targetCat = await Category.findOne({ name: id, restaurantId: req.restaurantId });
    }

    if (!targetCat) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if category contains menu items before deleting
    const linkedItemsCount = await MenuItem.countDocuments({
      restaurantId: req.restaurantId,
      category: targetCat.name,
    });
    if (linkedItemsCount > 0) {
      return res.status(400).json({
        message: `Cannot delete category "${targetCat.name}" because it contains ${linkedItemsCount} menu item(s).`,
      });
    }

    const deletedCat = await Category.findByIdAndDelete(targetCat._id);
    await logAudit(req.restaurantId, req.user, `deleted category "${deletedCat.name}"`);
    emitChange('category');
    res.json({ message: 'Category deleted successfully', category: deletedCat });
  } catch (err) {
    req.log.error({ err }, 'Error deleting category');
    res.status(500).json({ error: 'Failed to delete category' });
  }
}
