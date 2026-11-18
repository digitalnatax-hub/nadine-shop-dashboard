import { Db, Document, MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME ?? 'nadine_shop'

const client = uri ? new MongoClient(uri) : null
let cachedDb: Db | null = null

export async function getDb() {
  if (!client) {
    throw new Error('MONGODB_URI is not configured. Set it in .env.local or the deployment environment.')
  }

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
  const pettyCash = db.collection('petty_cash')
  const debtPayments = db.collection('debt_payments')
  const purchases = db.collection('inventory_purchases')
  const cashMovements = db.collection('cash_movements')
  const expenses = db.collection('business_expenses')

  await users.createIndex({ username: 1 }, { unique: true })
  await products.createIndex({ name: 1 })
  await sales.createIndex({ id: 1 }, { unique: true })
  await debts.createIndex({ name: 1 })
  await pettyCash.createIndex({ date: 1 })
  await debtPayments.createIndex({ debtId: 1, date: 1 })
  await purchases.createIndex({ date: 1 })
  await cashMovements.createIndex({ id: 1 }, { unique: true })
  await cashMovements.createIndex({ account: 1, date: 1 })
  await expenses.createIndex({ date: 1 })

  const defaultUsers = [
    { username: 'admin', password: 'nadine123', role: 'admin' },
    { username: 'cashier', password: 'cashier123', role: 'cashier' },
    { username: 'superadmin', password: 'Alain123', role: 'superadmin' },
  ]
  for (const user of defaultUsers) {
    await users.updateOne(
      { username: user.username },
      {
        $setOnInsert: {
          password: user.password,
          role: user.role,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    )
  }
}
