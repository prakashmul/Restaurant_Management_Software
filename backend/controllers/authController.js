import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { generateSecret, generate as generateTotp, verify as verifyTotp, generateURI } from 'otplib';
import QRCode from 'qrcode';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import StaffMembership from '../models/StaffMembership.js';
import Location from '../models/Location.js';
import { seedNewRestaurant, seedDefaultRoles } from '../services/seedService.js';

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

export function toRestaurantDTO(restaurant) {
  return {
    id: restaurant._id,
    name: restaurant.name,
    address: restaurant.address,
    phone: restaurant.phone,
    logoUrl: restaurant.logoUrl,
    currency: restaurant.currency,
    taxRatePercent: restaurant.taxRatePercent,
    loyaltyEarnRatePerRs: restaurant.loyaltyEarnRatePerRs,
    loyaltyPointValueRs: restaurant.loyaltyPointValueRs,
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

      const roles = await seedDefaultRoles(restaurant._id, session);
      const ownerRole = roles.find((r) => r.name === 'Owner');

      // Owner starts unrestricted (locationId: null) — they can see and
      // manage every location this restaurant ever adds, from day one.
      await StaffMembership.create(
        [
          {
            userId: newUser._id,
            restaurantId: restaurant._id,
            locationId: null,
            role: 'Owner',
            roleId: ownerRole._id,
          },
        ],
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
    const { email, password, totpToken } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password +totpSecret');
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

    // Password alone isn't enough for a TOTP-enabled account. The client
    // resubmits this same request with totpToken once the user has it —
    // no separate pending-session state, consistent with this app's fully
    // stateless JWT auth (see middleware/auth.js).
    if (user.totpEnabled) {
      if (!totpToken) {
        return res.status(200).json({ requiresTotp: true });
      }
      const result = await verifyTotp({ token: totpToken, secret: user.totpSecret });
      if (!result.valid) {
        return res.status(400).json({ message: 'Invalid authentication code.' });
      }
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

export async function getTotpStatus(req, res) {
  const user = await User.findById(req.user.id).select('totpEnabled');
  res.json({ totpEnabled: !!user?.totpEnabled });
}

// Generates a fresh secret and stores it unconfirmed (totpEnabled stays
// false) — the user must prove they've actually added it to an
// authenticator app via /2fa/enable before it starts gating login.
export async function setupTotp(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    // Otherwise a stolen session token could disable 2FA outright by
    // calling setup (which clears totpEnabled) without ever proving
    // possession of the current authenticator code — disable is the only
    // path allowed to turn it off, and that always re-verifies a code.
    if (user.totpEnabled) {
      return res.status(400).json({
        message: 'Two-factor authentication is already enabled. Disable it first to set up a new device.',
      });
    }

    const secret = generateSecret();
    user.totpSecret = secret;
    user.totpEnabled = false;
    await user.save();

    const otpauthUrl = generateURI({ issuer: 'Restaurant Management Software', label: user.email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    res.json({ secret, otpauthUrl, qrCodeDataUrl });
  } catch (err) {
    req.log.error({ err }, 'Error setting up TOTP');
    res.status(500).json({ message: 'Failed to start two-factor setup.' });
  }
}

export async function enableTotp(req, res) {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user.id).select('+totpSecret');
    if (!user || !user.totpSecret) {
      return res.status(400).json({ message: 'Start two-factor setup first.' });
    }

    const result = await verifyTotp({ token, secret: user.totpSecret });
    if (!result.valid) {
      return res.status(400).json({ message: 'Invalid authentication code.' });
    }

    user.totpEnabled = true;
    await user.save();
    res.json({ totpEnabled: true });
  } catch (err) {
    req.log.error({ err }, 'Error enabling TOTP');
    res.status(500).json({ message: 'Failed to enable two-factor authentication.' });
  }
}

export async function disableTotp(req, res) {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user.id).select('+totpSecret');
    if (!user || !user.totpEnabled) {
      return res.status(400).json({ message: 'Two-factor authentication is not enabled.' });
    }

    const result = await verifyTotp({ token, secret: user.totpSecret });
    if (!result.valid) {
      return res.status(400).json({ message: 'Invalid authentication code.' });
    }

    user.totpEnabled = false;
    user.totpSecret = null;
    await user.save();
    res.json({ totpEnabled: false });
  } catch (err) {
    req.log.error({ err }, 'Error disabling TOTP');
    res.status(500).json({ message: 'Failed to disable two-factor authentication.' });
  }
}
