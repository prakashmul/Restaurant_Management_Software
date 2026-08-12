import PlatformAdmin from '../models/PlatformAdmin.js';
import Restaurant from '../models/Restaurant.js';
import StaffMembership from '../models/StaffMembership.js';
import User from '../models/User.js';
import { PERMISSION_SECTIONS } from '../permissions.js';
import crypto from 'node:crypto';
import { generateResetToken, hashResetToken } from '../utils/resetToken.js';
import { sendEmail } from '../services/notificationService.js';

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

// The same page.* keys the per-role "Page Access" permission section
// already uses — one canonical list, so a page added there automatically
// shows up here too instead of needing to be typed out twice.
const PAGE_CATALOG = PERMISSION_SECTIONS.find((s) => s.key === 'pages').permissions;

export async function getPageCatalog(req, res) {
  res.json({ pages: PAGE_CATALOG });
}

export async function getMe(req, res) {
  const admin = await PlatformAdmin.findById(req.platformAdmin.id).select('name email isSeedAccount');
  if (!admin) return res.status(404).json({ message: 'Admin not found.' });
  res.json({ id: admin._id, name: admin.name, email: admin.email, isSeedAccount: admin.isSeedAccount });
}

// Every restaurant on the platform, plus its Owner's contact email and
// current page entitlements — the console's main directory view.
export async function listRestaurants(req, res) {
  const restaurants = await Restaurant.find().sort({ createdAt: -1 }).lean();

  const restaurantIds = restaurants.map((r) => r._id);
  const owners = await StaffMembership.find({ restaurantId: { $in: restaurantIds }, role: 'Owner' })
    .populate('userId', 'email name')
    .lean();
  const ownerByRestaurant = new Map(owners.map((m) => [String(m.restaurantId), m.userId]));

  res.json({
    restaurants: restaurants.map((r) => ({
      id: r._id,
      name: r.name,
      slug: r.slug,
      createdAt: r.createdAt,
      enabledPages: r.enabledPages || [],
      owner: ownerByRestaurant.get(String(r._id))
        ? {
            name: ownerByRestaurant.get(String(r._id)).name,
            email: ownerByRestaurant.get(String(r._id)).email,
          }
        : null,
    })),
  });
}

export async function updateRestaurantPages(req, res) {
  const { pages } = req.body;
  if (!Array.isArray(pages) || pages.some((p) => typeof p !== 'string')) {
    return res.status(400).json({ message: 'pages must be an array of page keys.' });
  }
  const validKeys = new Set(PAGE_CATALOG.map((p) => p.key));
  const filtered = [...new Set(pages.filter((p) => validKeys.has(p)))];

  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    { enabledPages: filtered },
    { new: true }
  ).select('name enabledPages');
  if (!restaurant) return res.status(404).json({ message: 'Restaurant not found.' });

  res.json({ id: restaurant._id, name: restaurant.name, enabledPages: restaurant.enabledPages });
}

export async function listAdmins(req, res) {
  const admins = await PlatformAdmin.find()
    .sort({ createdAt: 1 })
    .select('name email isSeedAccount passwordResetExpires createdAt')
    .lean();
  res.json({
    admins: admins.map((a) => ({
      id: a._id,
      name: a.name,
      email: a.email,
      isSeedAccount: a.isSeedAccount,
      // An invite is "pending" until the invitee sets their first real
      // password — inferred from an unexpired invite token still on file,
      // since password itself is never readable.
      inviteAccepted: !a.passwordResetExpires,
      createdAt: a.createdAt,
    })),
  });
}

// Invites a new platform admin — this is the mechanism the user asked for
// so future admins never require a code change. Reuses the same low-level
// generateResetToken/hashResetToken/sendEmail primitives the tenant
// forgot-password flow uses, but stays self-contained rather than reusing
// passwordSetupService.js, which is tightly coupled to the User model and a
// restaurantName.
export async function inviteAdmin(req, res) {
  const { name, email } = req.body;
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ message: 'Name and email are required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await PlatformAdmin.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(400).json({ message: 'An admin with this email already exists.' });
  }

  const { rawToken, tokenHash } = generateResetToken();

  // A placeholder password satisfies the schema's `required` constraint;
  // it's an unguessable random hash the invitee can never type, so the
  // account is unusable until they set a real one via the invite link.
  const admin = await PlatformAdmin.create({
    name: name.trim(),
    email: normalizedEmail,
    password: crypto.randomBytes(32).toString('hex'),
    addedBy: req.platformAdmin.id,
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: new Date(Date.now() + INVITE_TTL_MS),
  });

  const inviteUrl = `${process.env.FRONTEND_URL}/platform-admin/set-password?token=${rawToken}`;
  await sendEmail({
    restaurantName: 'Restaurant Management Software — Admin Console',
    to: normalizedEmail,
    subject: "You've been invited as a platform admin",
    html: `<p>Hi ${admin.name},</p><p>You've been invited to the platform admin console. Click the link below to set your password. This link expires in 24 hours.</p><p><a href="${inviteUrl}">Set your password</a></p><p>If this wasn't you, you can safely ignore this email.</p>`,
  });

  res.status(201).json({ id: admin._id, name: admin.name, email: admin.email });
}

// Public — no auth. The link in the invite email carries a token, not a
// session; this is how the invitee proves they own the inbox and picks
// their real password.
export async function acceptInvite(req, res) {
  const { token, password } = req.body;
  if (!token || !password || password.length < 8) {
    return res.status(400).json({ message: 'A valid token and an 8+ character password are required.' });
  }

  const tokenHash = hashResetToken(token);
  const admin = await PlatformAdmin.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpires');

  if (!admin) {
    return res.status(400).json({ message: 'This invite link is invalid or has expired.' });
  }

  admin.password = password;
  admin.passwordResetTokenHash = null;
  admin.passwordResetExpires = null;
  await admin.save();

  res.status(200).json({ message: 'Password set. You can now sign in.' });
}
