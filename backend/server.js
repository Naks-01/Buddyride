import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import crypto from 'node:crypto';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

app.post('/api/auth/login', (req, res) => {
  const { role, identifier, password } = req.body ?? {};
  const credentials = {
    passenger: { identifier: process.env.PASSENGER_PHONE, password: process.env.PASSENGER_PASSWORD },
    driver: { identifier: process.env.DRIVER_PHONE, password: process.env.DRIVER_PASSWORD },
    admin: { identifier: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  }[role];

  if (!credentials || identifier !== credentials.identifier || password !== credentials.password) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  return res.json({ token: crypto.randomUUID(), role });
});

const rideSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const Ride = mongoose.models.Ride || mongoose.model('Ride', rideSchema);

app.get('/api/rides/admin/all', async (req, res) => {
  try {
    const rides = await Ride.find({}).sort({ createdAt: -1 });
    res.json(rides);
  } catch (error) {
    console.error('Failed to load rides:', error);
    res.status(500).json({ error: 'Failed to load rides.' });
  }
});

app.delete('/api/ride/:id', async (req, res) => {
  try {
    await Ride.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete ride:', error);
    res.status(500).json({ error: 'Failed to delete ride.' });
  }
});

app.get('/:role/:id', (req, res) => {
  res.json({ role: req.params.role, id: req.params.id });
});

async function start() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is required to start the API server.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BuddyRide API listening on http://0.0.0.0:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Could not start BuddyRide API:', error);
  process.exit(1);
});
