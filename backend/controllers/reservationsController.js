import Reservation from '../models/Reservation.js';
import { logAudit } from '../services/auditService.js';
import { emitChange } from '../realtime/socket.js';

// Everything still open — upcoming reservations and anyone currently
// waiting — sorted so the next thing staff need to act on is first:
// reservations by booked time, waitlist entries by how long they've waited.
const OPEN_STATUSES = ['pending', 'confirmed', 'waiting'];

export async function listReservations(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { status, type } = req.query;
    const query = { restaurantId };
    if (locationId) query.locationId = locationId;
    if (status) query.status = status;
    else query.status = { $in: [...OPEN_STATUSES, 'seated'] };
    if (type) query.type = type;

    const reservations = await Reservation.find(query).sort({ reservationTime: 1, createdAt: 1 });
    res.json(reservations);
  } catch (err) {
    req.log.error({ err }, 'Error fetching reservations');
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
}

export async function createReservation(req, res) {
  try {
    const { restaurantId, locationId } = req;
    if (!locationId) {
      return res.status(400).json({ message: 'Select a location first' });
    }
    const { customerName, customerPhone, partySize, reservationTime, notes } = req.body;

    const reservation = await Reservation.create({
      restaurantId,
      locationId,
      type: 'reservation',
      customerName,
      customerPhone: customerPhone || '',
      partySize,
      reservationTime,
      notes: notes || '',
      status: 'pending',
    });

    await logAudit(
      restaurantId,
      req.user,
      `booked a reservation for ${customerName} (party of ${partySize}) at ${new Date(reservationTime).toLocaleString()}`,
      locationId
    );
    emitChange('reservation');
    res.status(201).json(reservation);
  } catch (err) {
    req.log.error({ err }, 'Error creating reservation');
    res.status(500).json({ error: 'Failed to create reservation' });
  }
}

export async function addToWaitlist(req, res) {
  try {
    const { restaurantId, locationId } = req;
    if (!locationId) {
      return res.status(400).json({ message: 'Select a location first' });
    }
    const { customerName, customerPhone, partySize, notes } = req.body;

    const entry = await Reservation.create({
      restaurantId,
      locationId,
      type: 'waitlist',
      customerName,
      customerPhone: customerPhone || '',
      partySize,
      notes: notes || '',
      status: 'waiting',
    });

    await logAudit(restaurantId, req.user, `added ${customerName} (party of ${partySize}) to the waitlist`, locationId);
    emitChange('reservation');
    res.status(201).json(entry);
  } catch (err) {
    req.log.error({ err }, 'Error adding to waitlist');
    res.status(500).json({ error: 'Failed to add to waitlist' });
  }
}

const VALID_TRANSITIONS = {
  pending: ['confirmed', 'seated', 'cancelled', 'no-show'],
  confirmed: ['seated', 'cancelled', 'no-show'],
  waiting: ['seated', 'cancelled', 'no-show'],
  seated: [],
  cancelled: [],
  'no-show': [],
};

export async function updateReservationStatus(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { status, tableId } = req.body;

    const reservation = await Reservation.findOne({ _id: req.params.id, restaurantId, locationId });
    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    const allowed = VALID_TRANSITIONS[reservation.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Cannot move a "${reservation.status}" entry to "${status}".` });
    }

    reservation.status = status;
    if (status === 'seated' && tableId) reservation.tableId = tableId;
    await reservation.save();

    await logAudit(
      restaurantId,
      req.user,
      `marked ${reservation.customerName}'s ${reservation.type} as ${status}`,
      locationId
    );
    emitChange('reservation');
    res.json(reservation);
  } catch (err) {
    req.log.error({ err }, 'Error updating reservation status');
    res.status(500).json({ error: 'Failed to update reservation' });
  }
}

export async function deleteReservation(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const deleted = await Reservation.findOneAndDelete({ _id: req.params.id, restaurantId, locationId });
    if (!deleted) {
      return res.status(404).json({ message: 'Reservation not found' });
    }
    await logAudit(restaurantId, req.user, `removed ${deleted.customerName}'s ${deleted.type} entry`, locationId);
    emitChange('reservation');
    res.json({ message: 'Removed successfully' });
  } catch (err) {
    req.log.error({ err }, 'Error deleting reservation');
    res.status(500).json({ error: 'Failed to remove entry' });
  }
}
