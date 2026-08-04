import jwt from 'jsonwebtoken';
import User from '../models/User.js';

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '12h',
  });
}

export async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    // Role is always forced to Staff here — there is no self-service path to Owner.
    const newUser = new User({ name, email, password, role: 'Staff' });
    await newUser.save();

    res.status(201).json({
      message: 'Account created successfully!',
      user: { name: newUser.name, email: newUser.email, role: newUser.role },
    });
  } catch (err) {
    req.log.error({ err }, 'Registration error');
    res.status(500).json({ message: 'Server error during registration.' });
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
      // Mongoose skips the pre-save hook's isModified('password') check when
      // a path is set to the exact value it already has — force it so the
      // hash actually gets written.
      user.markModified('password');
      await user.save();
      isValid = true;
    }

    if (!isValid) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const token = signToken(user);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: { name: user.name, email: user.email, role: user.role || 'Staff' },
    });
  } catch (err) {
    req.log.error({ err }, 'Login error');
    res.status(500).json({ message: 'Server error during login.' });
  }
}
