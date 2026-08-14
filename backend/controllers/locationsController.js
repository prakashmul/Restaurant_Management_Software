import Location from '../models/Location.js';
import Table from '../models/Table.js';
import { logAudit } from '../services/auditService.js';

export async function listLocations(req, res) {
  try {
    const locations = await Location.find({ restaurantId: req.restaurantId }).sort({ createdAt: 1 });
    res.json(locations);
  } catch (err) {
    req.log.error({ err }, 'Error fetching locations');
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
}

export async function createLocation(req, res) {
  try {
    const location = await Location.create({ restaurantId: req.restaurantId, ...req.body });
    await logAudit(req.restaurantId, req.user, `added location "${location.name}"`);
    res.status(201).json(location);
  } catch (err) {
    req.log.error({ err }, 'Error creating location');
    res.status(500).json({ error: 'Failed to create location' });
  }
}

export async function updateLocation(req, res) {
  try {
    const location = await Location.findOneAndUpdate(
      { _id: req.params.id, restaurantId: req.restaurantId },
      req.body,
      { returnDocument: 'after' }
    );
    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }
    res.json(location);
  } catch (err) {
    req.log.error({ err }, 'Error updating location');
    res.status(500).json({ error: 'Failed to update location' });
  }
}

// Split out from the general updateLocation above so it can sit behind its
// own, narrower locations.geofence permission — moving the attendance
// geofence is a more sensitive action than renaming a branch or updating
// its phone number, since it affects whether every staff member at this
// location can clock in at all.
export async function updateLocationGeofence(req, res) {
  try {
    const { latitude, longitude, radiusMeters } = req.body;
    const location = await Location.findOneAndUpdate(
      { _id: req.params.id, restaurantId: req.restaurantId },
      { geofence: { latitude, longitude, radiusMeters } },
      { returnDocument: 'after' }
    );
    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }
    await logAudit(
      req.restaurantId,
      req.user,
      latitude === null
        ? `cleared the attendance geofence for "${location.name}"`
        : `set the attendance geofence for "${location.name}" (${radiusMeters}m radius)`
    );
    res.json(location);
  } catch (err) {
    req.log.error({ err }, 'Error updating location geofence');
    res.status(500).json({ error: 'Failed to update geofence' });
  }
}

export async function deleteLocation(req, res) {
  try {
    const { restaurantId } = req;

    const totalLocations = await Location.countDocuments({ restaurantId });
    if (totalLocations <= 1) {
      return res.status(400).json({ message: 'A restaurant must have at least one location.' });
    }

    const hasTables = await Table.exists({ restaurantId, locationId: req.params.id });
    if (hasTables) {
      return res.status(400).json({
        message: 'Cannot delete this location because it still has tables. Remove them first.',
      });
    }

    const deleted = await Location.findOneAndDelete({ _id: req.params.id, restaurantId });
    if (!deleted) {
      return res.status(404).json({ message: 'Location not found' });
    }
    await logAudit(restaurantId, req.user, `removed location "${deleted.name}"`);
    res.json({ message: 'Location deleted successfully' });
  } catch (err) {
    req.log.error({ err }, 'Error deleting location');
    res.status(500).json({ error: 'Failed to delete location' });
  }
}
