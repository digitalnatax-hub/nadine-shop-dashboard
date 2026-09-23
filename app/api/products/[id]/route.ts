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

    const hasFullProductUpdate = ['name', 'category', 'stock', 'unit', 'buy', 'sell', 'min'].some((field) => field in body)
    const update = hasFullProductUpdate
      ? {
          name: String(body.name ?? product.name).trim(),
          category: String(body.category ?? product.category).trim() || product.category,
          stock: Math.max(0, Number(body.stock ?? product.stock)),
          unit: String(body.unit ?? product.unit).trim() || product.unit,
          buy: Math.max(0, Number(body.buy ?? product.buy ?? product.buy_price ?? 0)),
          sell: Math.max(0, Number(body.sell ?? product.sell ?? product.sell_price ?? 0)),
          min: Math.max(0, Number(body.min ?? product.min ?? product.min_stock ?? 5)),
        }
      : null
    const stockDelta = Number(body.stockDelta ?? 0)
    const nextStock = Math.max(0, Number(product.stock ?? 0) + stockDelta)
    const nextProduct = update ? { ...update } : { ...product, stock: nextStock }

    await products.updateOne({ id: Number(id) }, { $set: update ?? { stock: nextStock } })

    return NextResponse.json({
      ok: true,
      product: {
        ...product,
        ...nextProduct,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update product stock.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDatabaseSchema()
    const { id } = await params
    const products = await getCollection<any>('products')
    const result = await products.deleteOne({ id: Number(id) })

    if (!result.deletedCount) {
      return NextResponse.json({ ok: false, error: 'Product not found.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete product.'
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
