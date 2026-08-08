import Restaurant from '../models/Restaurant.js';
import { toRestaurantDTO } from './authController.js';
import { logAudit } from '../services/auditService.js';

export async function getRestaurant(req, res) {
  try {
    const restaurant = await Restaurant.findById(req.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }
    res.json(toRestaurantDTO(restaurant));
  } catch (err) {
    req.log.error({ err }, 'Error fetching restaurant');
    res.status(500).json({ error: 'Failed to fetch restaurant' });
  }
}

export async function updateRestaurant(req, res) {
  try {
    const { name, logoUrl, currency, taxRatePercent, loyaltyEarnRatePerRs, loyaltyPointValueRs } = req.body;
    const restaurant = await Restaurant.findById(req.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    if (name !== undefined) restaurant.name = name;
    if (logoUrl !== undefined) restaurant.logoUrl = logoUrl;
    if (currency !== undefined) restaurant.currency = currency;
    if (taxRatePercent !== undefined) restaurant.taxRatePercent = taxRatePercent;
    if (loyaltyEarnRatePerRs !== undefined) restaurant.loyaltyEarnRatePerRs = loyaltyEarnRatePerRs;
    if (loyaltyPointValueRs !== undefined) restaurant.loyaltyPointValueRs = loyaltyPointValueRs;
    await restaurant.save();

    await logAudit(req.restaurantId, req.user, 'updated restaurant settings');
    res.json(toRestaurantDTO(restaurant));
  } catch (err) {
    req.log.error({ err }, 'Error updating restaurant');
    res.status(500).json({ error: 'Failed to update restaurant' });
  }
}
