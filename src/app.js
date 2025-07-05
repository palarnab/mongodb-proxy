import { MongoClient, ObjectId } from 'mongodb';

import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

export const app = express();

app.use(bodyParser.json());

const allowedTokens = process.env.ALLOWED_TOKENS
  ? process.env.ALLOWED_TOKENS.split(',')
  : [];

app.get('/health', (req, res) => {
  res.send('🧩 MongoDB Proxy is running');
});

app.use((req, res, next) => {
  const token = req.headers['authorization'];
  if (token && allowedTokens.includes(token.replace('Bearer ', ''))) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

app.use((req, res, next) => {
  const { dbName, collectionName } = req.body;
  if (!collectionName || !dbName) {
    res.status(401).json({ error: 'Missing collection or db in body' });
  } else {
    next();
  }
});

let mongoClient;

export const connectDB = async () => {
  mongoClient = await MongoClient.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('✅ Mongo connected');
};

app.post('/create', async (req, res) => {
  const { dbName, collectionName, index, searchIndex } = req.body;
  const db = mongoClient.db(dbName);
  await db.createCollection(collectionName);
  const collection = db.collection(collectionName);
  if (index) {
    await collection.createIndex(index);
  }
  if (searchIndex) {
    await collection.createSearchIndex(searchIndex);
  }
  res.status(201).json({ message: `Collection ${collectionName} created` });
});

app.delete('/delete', async (req, res) => {
  const { dbName, collectionName } = req.body;
  const db = mongoClient.db(dbName);

  await db.collection(collectionName).drop();
  res.status(200).json({ message: `Collection ${collectionName} deleted` });
});

app.post('/find', async (req, res) => {
  const { dbName, collectionName, filter, page, pageSize } = req.body;
  const db = mongoClient.db(dbName);
  const skip = page ? Number(page) * pageSize : 0;
  const limit = pageSize ? Number(pageSize) || 10 : 10;

  const count = await db.collection(collectionName).count(filter || {});

  const results = await db
    .collection(collectionName)
    .find(filter || {})
    .skip(skip)
    .limit(limit)
    .toArray();

  res
    .setHeader('TotalRecords', count)
    .setHeader('Access-Control-Expose-Headers', `TotalRecords`)
    .json(results);
});

app.post('/aggregate', async (req, res) => {
  const { dbName, collectionName, pipeline } = req.body;
  if (!pipeline) {
    return res
      .status(400)
      .json({ error: 'Missing collection or pipeline param' });
  }
  const db = mongoClient.db(dbName);
  const results = await db
    .collection(collectionName)
    .aggregate(pipeline)
    .toArray();
  res.json(results);
});

app.post('/insert', async (req, res) => {
  const { dbName, collectionName, document } = req.body;
  if (!document) {
    return res
      .status(400)
      .json({ error: 'Missing collection or document in body' });
  }
  const db = mongoClient.db(dbName);
  const result = await db.collection(collectionName).insertOne(document);
  res.status(201).json(result);
});

app.post('/insertMany', async (req, res) => {
  const { dbName, collectionName, documents } = req.body;
  if (!Array.isArray(documents) || documents.length === 0) {
    return res
      .status(400)
      .json({ error: 'Missing collection or documents in body' });
  }
  const db = mongoClient.db(dbName);
  const result = await db.collection(collectionName).insertMany(documents);
  res.status(201).json(result);
});

app.post('/findByIdAndUpdate', async (req, res) => {
  const { dbName, collectionName, id, update } = req.body;
  if (!id || !update) {
    return res
      .status(400)
      .json({ error: 'Missing collection, id or update in body' });
  }
  const db = mongoClient.db(dbName);
  const result = await db
    .collection(collectionName)
    .findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnNewDocument: true },
    );
  res.status(200).json(result);
});

app.delete('/findByIdAndDelete', async (req, res) => {
  const { dbName, collectionName, id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Missing collection or id in body' });
  }
  const db = mongoClient.db(dbName);
  const result = await db
    .collection(collectionName)
    .findOneAndDelete({ _id: new ObjectId(id) });
  res.status(200).json(result);
});

app.use((err, req, res, next) => {
  console.error(err.message, err);
  res.status(500).json({ error: err.message });
});
