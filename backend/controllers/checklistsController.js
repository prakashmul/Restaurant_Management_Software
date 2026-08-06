import ChecklistTemplate from '../models/ChecklistTemplate.js';
import ChecklistCompletion from '../models/ChecklistCompletion.js';
import User from '../models/User.js';
import { emitChange } from '../realtime/socket.js';

function toCompletionDTO(completion) {
  return {
    completionId: completion._id,
    templateId: completion.templateId,
    templateName: completion.templateName,
    date: completion.date,
    items: completion.items.map((item, index) => ({
      index,
      text: item.text,
      done: item.done,
      completedBy: item.completedBy,
      completedAt: item.completedAt,
    })),
    completedCount: completion.items.filter((i) => i.done).length,
    totalCount: completion.items.length,
  };
}

async function getOrCreateTodayCompletion(restaurantId, locationId, template, date) {
  try {
    return await ChecklistCompletion.findOneAndUpdate(
      { restaurantId, locationId, templateId: template._id, date },
      {
        $setOnInsert: {
          restaurantId,
          locationId,
          templateId: template._id,
          templateName: template.name,
          date,
          items: template.items.map((i) => ({ text: i.text, done: false, completedBy: '', completedAt: null })),
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (err) {
    if (err.code === 11000) {
      return ChecklistCompletion.findOne({ restaurantId, locationId, templateId: template._id, date });
    }
    throw err;
  }
}

export async function listTemplates(req, res) {
  try {
    const templates = await ChecklistTemplate.find({ restaurantId: req.restaurantId }).sort({ createdAt: 1 });
    res.json(templates);
  } catch (err) {
    req.log.error({ err }, 'Error fetching checklist templates');
    res.status(500).json({ error: 'Failed to fetch checklist templates' });
  }
}

export async function createTemplate(req, res) {
  try {
    const { name, items } = req.body;
    const template = await ChecklistTemplate.create({
      restaurantId: req.restaurantId,
      name,
      items: items.map((text) => ({ text })),
    });
    res.status(201).json(template);
  } catch (err) {
    req.log.error({ err }, 'Error creating checklist template');
    res.status(500).json({ error: 'Failed to create checklist template' });
  }
}

export async function deleteTemplate(req, res) {
  try {
    const { restaurantId } = req;
    const deleted = await ChecklistTemplate.findOneAndDelete({ _id: req.params.id, restaurantId });
    if (!deleted) {
      return res.status(404).json({ message: 'Checklist template not found' });
    }
    await ChecklistCompletion.deleteMany({ restaurantId, templateId: deleted._id });
    emitChange('checklist');
    res.json({ message: 'Checklist template deleted successfully' });
  } catch (err) {
    req.log.error({ err }, 'Error deleting checklist template');
    res.status(500).json({ error: 'Failed to delete checklist template' });
  }
}

export async function getToday(req, res) {
  try {
    const { restaurantId, locationId } = req;
    if (!locationId) {
      return res.status(400).json({ message: 'Select a location first' });
    }
    const date = new Date().toISOString().slice(0, 10);
    const templates = await ChecklistTemplate.find({ restaurantId });

    const completions = await Promise.all(
      templates.map((template) => getOrCreateTodayCompletion(restaurantId, locationId, template, date))
    );

    res.json(completions.filter(Boolean).map(toCompletionDTO));
  } catch (err) {
    req.log.error({ err }, "Error fetching today's checklists");
    res.status(500).json({ error: 'Failed to fetch checklists' });
  }
}

export async function toggleItem(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { completionId, itemIndex } = req.params;
    const index = Number(itemIndex);

    const completion = await ChecklistCompletion.findOne({ _id: completionId, restaurantId, locationId });
    if (!completion) {
      return res.status(404).json({ message: 'Checklist not found' });
    }
    const item = completion.items[index];
    if (!item) {
      return res.status(400).json({ message: 'Invalid checklist item' });
    }

    item.done = !item.done;
    if (item.done) {
      const user = await User.findById(req.user.id).select('name');
      item.completedBy = user?.name || req.user.email;
      item.completedAt = new Date();
    } else {
      item.completedBy = '';
      item.completedAt = null;
    }
    await completion.save();

    emitChange('checklist');
    res.json(toCompletionDTO(completion));
  } catch (err) {
    req.log.error({ err }, 'Error toggling checklist item');
    res.status(500).json({ error: 'Failed to update checklist item' });
  }
}
