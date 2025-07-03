import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { app, connectDB } from '../app.js';
import { ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.ALLOWED_TOKENS = 'testtoken';
  await connectDB();
});

afterAll(async () => {
  await mongod.stop();
});

const auth = { Authorization: 'Bearer testtoken' };
const testCollection = 'users';

describe('MongoDB Proxy API', () => {
  it('GET /health → 200 OK', async () => {
    const res = await request(app).get('/health').set(auth);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/MongoDB Proxy/);
  });

  it('POST /create → 201 Created', async () => {
    const res = await request(app)
      .post('/create')
      .set(auth)
      .send({ collection: testCollection });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain(testCollection);
  });

  it('POST /insert → 201 Created', async () => {
    const res = await request(app)
      .post('/insert')
      .set(auth)
      .send({
        collection: testCollection,
        document: { name: 'Alice', age: 30 },
      });

    expect(res.status).toBe(201);
    expect(res.body.insertedId).toBeDefined();
  });

  it('POST /insertMany → 201 Created', async () => {
    const res = await request(app)
      .post('/insertMany')
      .set(auth)
      .send({
        collection: testCollection,
        documents: [
          { name: 'Bob', age: 25 },
          { name: 'Charlie', age: 35 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.insertedCount).toBe(2);
  });

  it('GET /find → returns documents with pagination', async () => {
    const res = await request(app)
      .get(`/find?collection=${testCollection}&page=0&pageSize=2`)
      .set(auth);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(2);
  });

  it('PUT /findByIdAndUpdate → 200 OK', async () => {
    // Insert a doc first
    const insert = await request(app)
      .post('/insert')
      .set(auth)
      .send({
        collection: testCollection,
        document: { name: 'David', age: 40 },
      });

    const id = insert.body.insertedId;

    const res = await request(app)
      .put('/findByIdAndUpdate')
      .set(auth)
      .send({
        collection: testCollection,
        id: new ObjectId(id),
        update: { age: 41 },
      });

    expect(res.status).toBe(200);
    expect(res.body.value.name).toBe('David');
    expect(res.body.value.age).toBe(40); // ReturnOriginal = true
  });

  it('DELETE /findByIdAndDelete → 200 OK', async () => {
    const insert = await request(app)
      .post('/insert')
      .set(auth)
      .send({
        collection: testCollection,
        document: { name: 'Eve', age: 45 },
      });

    const id = insert.body.insertedId;

    const res = await request(app)
      .delete('/findByIdAndDelete')
      .set(auth)
      .send({
        collection: testCollection,
        id: new ObjectId(id),
      });

    expect(res.status).toBe(200);
    expect(res.body.value.name).toBe('Eve');
  });

  it('GET /aggregate → returns aggregation results', async () => {
    const pipeline = encodeURIComponent(
      JSON.stringify([{ $match: { age: { $gt: 20 } } }])
    );

    const res = await request(app)
      .get(`/aggregate?collection=${testCollection}&pipeline=${pipeline}`)
      .set(auth);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('DELETE /delete → drops collection', async () => {
    const res = await request(app)
      .delete('/delete')
      .set(auth)
      .send({ collection: testCollection });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain(testCollection);
  });

  it('Rejects unauthorized requests', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(401);
  });
});
it('Rejects requests with invalid token', async () => {
    const res = await request(app)
      .get('/health')
      .set({ Authorization: 'Bearer invalidtoken' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
  });