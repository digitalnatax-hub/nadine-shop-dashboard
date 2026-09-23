import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function GET() {
  try {
    await ensureDatabaseSchema()
    const products = await (await getCollection<any>('products')).find({}).sort({ _id: -1 }).toArray()
    return NextResponse.json({ ok: true, products: products.map((product) => ({
      id: Number(product.id),
      name: product.name,
      category: product.category,
      stock: Number(product.stock ?? 0),
      unit: product.unit,
      buy: Number(product.buy ?? 0),
      sell: Number(product.sell ?? 0),
      min: Number(product.min ?? 5),
    })) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch products.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabaseSchema()
    const body = await request.json()
    const name = String(body.name ?? '').trim()
    const category = String(body.category ?? 'Other').trim() || 'Other'
    const stock = Number(body.stock ?? 0)
    const unit = String(body.unit ?? 'pieces').trim() || 'pieces'
    const buy = Number(body.buy ?? 0)
    const sell = Number(body.sell ?? 0)
    const min = Number(body.min ?? 5)

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Product name is required.' }, { status: 400 })
    }

    const products = await getCollection<any>('products')
    const last = await products.find({}).sort({ id: -1 }).limit(1).next()
    const id = Number(last?.id ?? 0) + 1

    const product = {
      id,
      name,
      category,
      stock,
      unit,
      buy,
      sell,
      min,
      createdAt: new Date(),
    }

    await products.insertOne(product)

    return NextResponse.json({ ok: true, product: { ...product } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create product.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
