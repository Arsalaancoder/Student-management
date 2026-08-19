import checkSimilarityHandler from './check-similarity.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return checkSimilarityHandler(req, res);
}
