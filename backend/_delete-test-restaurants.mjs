import 'dotenv/config';
import mongoose from 'mongoose';
import { deleteRestaurantCascade } from './services/restaurantDeletionService.js';

const TARGET_IDS = [
  ['Switch Table Test Co', '6a7d9d3e84e0eafbe0ce7dcc'],
  ['Receipt Breakdown Test Co', '6a7d69536889ec22c6f3f9c9'],
  ['Payment Split Verify Co', '6a7bb10901f41f1e1c58f201'],
  ['Profit Verify Co', '6a7ba9dfd1b46e559da322b8'],
  ['Weighted Avg UI Co', '6a7ba070e62607ef8a562671'],
  ['Weighted Avg Repro Co', '6a7ba05ce62607ef8a56265e'],
  ['Order Bug Repro Co', '6a7b26a2dc1b39e7901426c0'],
  ['Page Access UI Co', '6a7b1c588133c063e6b30906'],
  ['Role Page Test Co', '6a7b1827d58c3e1fe5416787'],
  ['Currency Test Chain', '6a7b132ddef79764b2724ff9'],
  ['Responsive Test Cafe 1786195905843', '6a772fca59192547346a64a3'],
];

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
await mongoose.connect(uri);

for (const [name, id] of TARGET_IDS) {
  const result = await deleteRestaurantCascade(id);
  console.log(`Deleted "${name}" (${id}):`, JSON.stringify(result));
}

await mongoose.disconnect();
console.log('\nDone.');
