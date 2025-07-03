import dotenv from 'dotenv';
import express from 'express';
import { MongoClient } from 'mongodb';
import bodyParser from 'body-parser';

dotenv.config();

export const app = express();

app.use(bodyParser.json());

const allowedTokens = process.env.ALLOWED_TOKENS ? process.env.ALLOWED_TOKENS.split(',') : [];

app.use((req, res, next) => {
  const token = req.headers['authorization'];
  if (allowedTokens.includes(token.replace('Bearer ', ''))) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
});


let db;
let mongoClient;

export const connectDB = async () => {
  mongoClient = await MongoClient.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  app.locals.db = mongoClient.db();
  console.log('✅ Mongo connected');
}
  
app.get('/health', (req, res) => {
  res.send('🧩 MongoDB Proxy is running');
});

app.post('/create', async (req, res) => {
  const { collection, index, searchIndex } = req.body;
  if (!collection) {
    return res.status(400).json({ error: 'Missing collection or index in body' });
  }

  try {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    if (!collections.some((col) => col.name === collection)) {
        await db.createCollection(collection);
        const collection = db.collection(collection);
        if (index) {
          await collection.createIndex(index);
        }
        if (searchIndex) {
          await collection.createSearchIndex(searchIndex);
        }
        res.status(201).json({ message: `Collection ${collection} created` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/delete', async (req, res) => {
  const { collection } = req.body;
  if (!collection) {
    return res.status(400).json({ error: 'Missing collection in body' });
  }

  try {
    await db.collection(collection).drop();
    res.status(200).json({ message: `Collection ${collection} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/find', async (req, res) => {
  const { collection, filter, page, pageSize } = req.query;
  if (!collection) {
     return res.status(400).json({ error: 'Missing collection param' });
  }
  const skip = page ? Number(page) * pageSize : 0;
  const limit = pageSize ? Number(pageSize) || 10 : 10;
  try {
    const results = await db.collection(collection).find(filter || {}).skip(skip).limit(limit).toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/aggregate', async (req, res) => {
  const { collection, pipeline } = req.query;
  if (!collection || !pipeline) {
     return res.status(400).json({ error: 'Missing collection or pipeline param' });
  }
  try {
    const results = await db.collection(collection).aggregate(pipeline).toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/insert', async (req, res) => {
  const { collection, document } = req.body;
  if (!collection || !document) {
    return res.status(400).json({ error: 'Missing collection or document in body' });
  }

  try {
    const result = await db.collection(collection).insertOne(document);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/insertMany', async (req, res) => {
  const { collection, documents } = req.body;
  if (!collection || !Array.isArray(documents) || documents.length === 0) {
    return res.status(400).json({ error: 'Missing collection or documents in body' });
  }

  try {
    const result = await db.collection(collection).insertMany(documents);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/findByIdAndUpdate', async (req, res) => {
  const { collection, id, update } = req.body;
  if (!collection || !id || !update) {
    return res.status(400).json({ error: 'Missing collection, id or update in body' });
  }

  try {
    const result = await db.collection(collection).findOneAndUpdate({ _id: id }, { $set: update }, { returnOriginal: true });
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/findByIdAndDelete', async (req, res) => {
  const { collection, id } = req.body;
  if (!collection || !id) {
    return res.status(400).json({ error: 'Missing collection or id in body' });
  }

  try {
    const result = await db.collection(collection).findOneAndDelete({ _id: id });
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});