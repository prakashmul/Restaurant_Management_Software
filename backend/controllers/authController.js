import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import StaffMembership from '../models/StaffMembership.js';
import Location from '../models/Location.js';
import { seedNewRestaurant } from '../services/seedService.js';

function signToken(user, membership) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      restaurantId: membership.restaurantId.toString(),
      role: membership.role,
      locationId: membership.locationId ? membership.locationId.toString() : null,
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function toRestaurantDTO(restaurant) {
  return {
    id: restaurant._id,
    name: restaurant.name,
    address: restaurant.address,
    phone: restaurant.phone,
    logoUrl: restaurant.logoUrl,
    currency: restaurant.currency,
    taxRatePercent: restaurant.taxRatePercent,
    geofence: restaurant.geofence,
  };
}

function slugify(name) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'restaurant';
  return `${base}-${Date.now().toString(36)}`;
}

// Public sign-up: creates a brand-new restaurant and its Owner account —
// this is how a new tenant comes into being. Adding staff to an *existing*
// restaurant happens through the authenticated staff-invite endpoint
// instead (see staffController.js), not through this route.
export async function register(req, res) {
  const { name, email, password, restaurantName } = req.body;

  const session = await mongoose.startSession();
  try {
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    let restaurant;
    let newUser;

    await session.withTransaction(async () => {
      restaurant = (
        await Restaurant.create([{ name: restaurantName.trim(), slug: slugify(restaurantName) }], { session })
      )[0];

      const location = (
        await Location.create([{ restaurantId: restaurant._id, name: 'Main Location' }], { session })
      )[0];

      newUser = (await User.create([{ name, email, password }], { session }))[0];

      // Owner starts unrestricted (locationId: null) — they can see and
      // manage every location this restaurant ever adds, from day one.
      await StaffMembership.create(
        [{ userId: newUser._id, restaurantId: restaurant._id, locationId: null, role: 'Owner' }],
        { session }
      );

      await seedNewRestaurant(restaurant._id, location._id, session);
    });

    res.status(201).json({
      message: 'Restaurant created successfully!',
      user: { name: newUser.name, email: newUser.email, role: 'Owner', locationId: null },
      restaurant: toRestaurantDTO(restaurant),
    });
  } catch (err) {
    req.log.error({ err }, 'Registration error');
    res.status(500).json({ message: 'Server error during registration.' });
  } finally {
    session.endSession();
  }
}

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$/;

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    let isValid = await user.comparePassword(password);

    // Transparent migration: accounts created before password hashing was
    // added still have their original plaintext password stored. If the
    // bcrypt check failed but the stored value isn't a bcrypt hash and
    // matches the plaintext input exactly, accept the login and upgrade the
    // stored password to a real hash so this path never runs again for them.
    if (!isValid && !BCRYPT_HASH_PATTERN.test(user.password) && user.password === password) {
      user.password = password;
      user.markModified('password');
      await user.save();
      isValid = true;
    }

    if (!isValid) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    // A user can in principle hold memberships at more than one restaurant;
    // for now we sign them into the first one. A "pick a restaurant" step
    // is a follow-up once that's a real scenario rather than a hypothetical.
    const membership = await StaffMembership.findOne({ userId: user._id });
    if (!membership) {
      return res.status(403).json({ message: 'This account is not linked to any restaurant.' });
    }

    const restaurant = await Restaurant.findById(membership.restaurantId);
    const token = signToken(user, membership);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        name: user.name,
        email: user.email,
        role: membership.role,
        locationId: membership.locationId ? membership.locationId.toString() : null,
      },
      restaurant: restaurant ? toRestaurantDTO(restaurant) : null,
    });
  } catch (err) {
    req.log.error({ err }, 'Login error');
    res.status(500).json({ message: 'Server error during login.' });
  }
}
