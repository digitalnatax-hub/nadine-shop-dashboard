import { Db, Document, MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017'
const dbName = process.env.MONGODB_DB_NAME ?? 'nadine_shop'

const client = new MongoClient(uri)
let cachedDb: Db | null = null

export async function getDb() {
  if (cachedDb) {
    return cachedDb
  }

  await client.connect()
  cachedDb = client.db(dbName)
  return cachedDb
}

export async function getCollection<T extends Document>(name: string) {
  const db = await getDb()
  return db.collection<T>(name)
}

export async function ensureDatabaseSchema() {
  const db = await getDb()

  const users = db.collection('users')
  const products = db.collection('products')
  const sales = db.collection('sales')
  const debts = db.collection('debts')

  await users.createIndex({ username: 1 }, { unique: true })
  await products.createIndex({ name: 1 })
  await sales.createIndex({ id: 1 }, { unique: true })
  await debts.createIndex({ name: 1 })

  const userCount = await users.countDocuments()
  if (userCount === 0) {
    await users.insertMany([
      { username: 'admin', password: 'nadine123', role: 'admin', createdAt: new Date() },
      { username: 'cashier', password: 'cashier123', role: 'cashier', createdAt: new Date() },
    ])
  }
}
