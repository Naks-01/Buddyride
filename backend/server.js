import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

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
