import { NextResponse } from 'next/server'
import { ensureDatabaseSchema, getCollection } from '@/lib/db'

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseSchema()
    const { id } = await params
    const body = await _request.json()
    const products = await getCollection<any>('products')
    const product = await products.findOne({ id: Number(id) })

    if (!product) {
      return NextResponse.json({ ok: false, error: 'Product not found.' }, { status: 404 })
    }

    const stockDelta = Number(body.stockDelta ?? 0)
    const nextStock = Math.max(0, Number(product.stock ?? 0) + stockDelta)

    await products.updateOne({ id: Number(id) }, { $set: { stock: nextStock } })

    return NextResponse.json({
      ok: true,
      product: {
        ...product,
        stock: nextStock,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update product stock.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
