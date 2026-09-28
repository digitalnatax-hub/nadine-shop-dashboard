'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Pencil,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  TrendingUp,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react'

type Product = {
  id: number
  name: string
  category: string
  stock: number
  unit: string
  buy: number
  sell: number
  min: number
}

type Sale = {
  id: string
  date: string
  items: { productId?: number; name: string; qty: number; unit: string; price: number; buy: number }[]
  total: number
  profit: number
  vat: boolean
  creditDebtId?: number
}

type Debt = {
  id: number
  name: string
  phone?: string
  amount: number
  original: number
  paidAmount?: number
  kind: 'customer' | 'supplier'
  due: string
  status?: 'unpaid' | 'settling' | 'paid'
  description?: string
  items?: Sale['items']
  vat?: boolean
}

type PettyCash = {
  id: string
  date: string
  amount: number
  reason: string
}

type CartItem = {
  product: Product
  qty: number
}

const money = (value: number) => `${Math.round(value).toLocaleString('en-US')} RWF`

const getQuantityStep = (unit: string) => {
  const normalized = unit.toLowerCase()
  return ['kg', 'grams', 'gram', 'liters', 'liter', 'litre', 'litres', 'l'].includes(normalized) ? 0.5 : 1
}

const normalizeQuantity = (value: number, unit: string) => {
  const step = getQuantityStep(unit)
  const safeValue = Number.isFinite(value) ? value : 0
  const rounded = step >= 1 ? Math.max(0, Math.round(safeValue)) : Math.max(0, Number((Math.round(safeValue / step) * step).toFixed(2)))
  return rounded
}

const formatQuantity = (value: number, unit: string) => {
  const rendered = Number.isInteger(value) ? value : Number(value.toFixed(2))
  return `${rendered} ${unit}`
}

export default function Page() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [page, setPage] = useState('Dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [pettyCash, setPettyCash] = useState<PettyCash[]>([])
  const [showProduct, setShowProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showSale, setShowSale] = useState(false)
  const [showDebt, setShowDebt] = useState(false)
  const [showPettyCash, setShowPettyCash] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [receipt, setReceipt] = useState<Sale | null>(null)
  const [editingSale, setEditingSale] = useState<Sale | null>(null)
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null)
  const [search, setSearch] = useState('')
  const [includeVat, setIncludeVat] = useState(true)
  const [cart, setCart] = useState<CartItem[]>([])

  const loadData = async () => {
    const response = await fetch('/api/data', { cache: 'no-store' })
    if (!response.ok) {
      return
    }

    const payload = await response.json()
    if (!payload.ok) {
      return
    }

    setProducts(payload.products ?? [])
    setSales(payload.sales ?? [])
    setDebts(payload.debts ?? [])
    setPettyCash(payload.pettyCash ?? [])
  }

  useEffect(() => {
    if (loggedIn) {
      void loadData()
    }
  }, [loggedIn])

  const totals = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const todaySales = sales.filter((entry) => entry.date === today)
    const todayPettyCash = pettyCash.filter((entry) => entry.date === today)
    const todayVat = todaySales.reduce((sum, entry) => sum + (entry.vat ? Number(entry.total) - Number(entry.total) / 1.18 : 0), 0)
    const todayPettyTotal = todayPettyCash.reduce((sum, entry) => sum + Number(entry.amount), 0)

    return {
      sales: sales.reduce((sum, entry) => sum + Number(entry.total), 0),
      profit: sales.reduce((sum, entry) => sum + Number(entry.profit), 0),
      todaySales: todaySales.reduce((sum, entry) => sum + (entry.vat ? Number(entry.total) / 1.18 : Number(entry.total)), 0),
      todayProfit: todaySales.reduce((sum, entry) => sum + Number(entry.profit), 0) - todayPettyTotal,
      todayVat,
      todayPettyTotal,
      owed: debts.filter((entry) => entry.kind === 'customer').reduce((sum, entry) => sum + Number(entry.amount), 0),
      owe: debts.filter((entry) => entry.kind === 'supplier').reduce((sum, entry) => sum + Number(entry.amount), 0),
    }
  }, [sales, debts, pettyCash])

  const lowStock = products.filter((product) => product.stock <= product.min)

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoginError('')

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      setLoginError(payload.error ?? 'Login failed.')
      return
    }

    setLoggedIn(true)
    await loadData()
  }

  const addToCart = (product: Product) => {
    const step = getQuantityStep(product.unit)

    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      if (existing) {
        const nextQty = normalizeQuantity(existing.qty + step, product.unit)
        if (nextQty > product.stock) {
          return current
        }
        return current.map((item) =>
          item.product.id === product.id ? { ...item, qty: nextQty } : item,
        )
      }
      if (product.stock <= 0) {
        return current
      }
      return [...current, { product, qty: normalizeQuantity(1, product.unit) }]
    })
  }

  const updateCartQty = (productId: number, quantity: number, unit: string) => {
    setCart((current) =>
      current
        .map((item) =>
          item.product.id === productId ? { ...item, qty: normalizeQuantity(quantity, unit) } : item,
        )
        .filter((item) => item.qty > 0),
    )
  }

  const completeSale = async () => {
    if (!cart.length) {
      return
    }

    const subtotal = cart.reduce((sum, item) => sum + item.product.sell * item.qty, 0)
    const salePayload = {
      id: `NS-${Date.now().toString().slice(-6)}`,
      date: new Date().toISOString().slice(0, 10),
      items: cart.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        qty: item.qty,
        unit: item.product.unit,
        price: item.product.sell,
        buy: item.product.buy,
      })),
      total: subtotal * (includeVat ? 1.18 : 1),
      profit: cart.reduce((sum, item) => sum + (item.product.sell - item.product.buy) * item.qty, 0),
      vat: includeVat,
    }

    const response = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(salePayload),
    })

    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      setLoginError(payload.error ?? 'Sale could not be saved.')
      return
    }

    setSales((current) => [payload.sale, ...current])
    setProducts((current) =>
      current.map((product) => {
        const item = cart.find((entry) => entry.product.id === product.id)
        if (!item) {
          return product
        }
        return { ...product, stock: Math.max(0, product.stock - item.qty) }
      }),
    )
    setCart([])
    setShowSale(false)
    setReceipt(payload.sale)
  }

  const completeCreditSale = async (customer: { name: string; phone?: string }) => {
    if (!cart.length) return
    const response = await fetch('/api/debts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: customer.name,
        phone: customer.phone,
        kind: 'customer',
        due: new Date().toISOString().slice(0, 10),
        vat: includeVat,
        items: cart.map((item) => ({ productId: item.product.id, qty: item.qty })),
      }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Credit sale could not be saved.')
    setDebts((current) => [payload.debt, ...current])
    setProducts((current) => current.map((product) => {
      const cartItem = cart.find((entry) => entry.product.id === product.id)
      return cartItem ? { ...product, stock: product.stock - cartItem.qty } : product
    }))
    setCart([])
    setShowSale(false)
  }

  const deleteSale = async (sale: Sale) => {
    const prompt = sale.creditDebtId
      ? `Reverse the payment for ${sale.id}? This will reopen the customer's debt.`
      : `Delete sale ${sale.id}? Its items will be returned to stock.`
    if (!window.confirm(prompt)) return
    const response = await fetch(`/api/sales/${encodeURIComponent(sale.id)}`, { method: 'DELETE' })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      setLoginError(payload.error ?? 'Unable to delete sale.')
      return
    }
    if (payload.reversedSettlement) {
      await loadData()
      return
    }
    setSales((current) => current.filter((entry) => entry.id !== sale.id))
    setProducts((current) => current.map((product) => ({
      ...product,
      stock: product.stock + sale.items.filter((item) => item.productId === product.id || (!item.productId && item.name === product.name)).reduce((sum, item) => sum + item.qty, 0),
    })))
  }

  const updateSale = async (sale: Sale, items: Sale['items'], date: string, vat: boolean) => {
    const response = await fetch(`/api/sales/${encodeURIComponent(sale.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, vat, items }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Unable to update sale.')
    await loadData()
    setEditingSale(null)
  }

  const settleDebt = async (debt: Debt, amount: number) => {
    const response = await fetch(`/api/debts/${debt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? 'Unable to record payment.')
    }
    await loadData()
    setPayingDebt(null)
  }

  const createProduct = async (input: { name: string; category: string; stock: number; unit: string; buy: number; sell: number; min: number }) => {
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })

    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? 'Unable to create product.')
    }

    setProducts((current) => [payload.product, ...current])
    setShowProduct(false)
  }

  const updateProduct = async (id: number, input: { name: string; category: string; stock: number; unit: string; buy: number; sell: number; min: number }) => {
    const response = await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? 'Unable to update product.')
    }
    setProducts((current) => current.map((product) => product.id === id ? payload.product : product))
    setEditingProduct(null)
  }

  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) {
      return
    }
    const response = await fetch(`/api/products/${product.id}`, { method: 'DELETE' })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      setLoginError(payload.error ?? 'Unable to delete product.')
      return
    }
    setProducts((current) => current.filter((entry) => entry.id !== product.id))
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const response = await fetch('/api/auth/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, currentPassword, newPassword }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? 'Unable to change password.')
    }
    setShowPassword(false)
  }

  const createDebt = async (input: { name: string; phone?: string; amount: number; kind: 'customer' | 'supplier'; due: string; description?: string }) => {
    const response = await fetch('/api/debts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        phone: input.phone ?? null,
        amount: input.amount,
        kind: input.kind,
        due: input.due,
        description: input.description,
      }),
    })

    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? 'Unable to save debt record.')
    }

    setDebts((current) => [payload.debt, ...current])
    setShowDebt(false)
  }

  const createPettyCash = async (input: { amount: number; reason: string; date: string }) => {
    const response = await fetch('/api/petty-cash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? 'Unable to save petty cash record.')
    }
    setPettyCash((current) => [payload.pettyCash, ...current])
  }

  const handleLogout = () => {
    setLoggedIn(false)
    setProducts([])
    setSales([])
    setDebts([])
    setPettyCash([])
    setPage('Dashboard')
  }

  if (!loggedIn) {
    return (
      <main className="login-shell">
        <section className="login-brand">
          <div className="brand-mark">
            <Package />
          </div>
          <span>NADINE&apos;S SHOP</span>
          <h1>
            Know your shop.
            <br />
            <em>Grow your business.</em>
          </h1>
          <p>Everything you need to manage stock, sales, customers and profit in one secure workspace.</p>
          <div className="login-stats">
            <span>
              <strong>{products.length || 0}</strong>
              products tracked
            </span>
            <span>
              <strong>18%</strong>
              VAT ready
            </span>
          </div>
        </section>

        <section className="login-card">
          <div className="login-heading">
            <span className="eyebrow">WELCOME BACK</span>
            <h2>Sign in to your workspace</h2>
            <p>Use your local admin credentials to access the shop system.</p>
          </div>

          <form onSubmit={handleLogin}>
            <label>
              Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
              />
            </label>

            {loginError ? <div className="error-text">{loginError}</div> : null}

            <button className="primary-btn" type="submit">
              Sign in <ChevronRight />
            </button>
          </form>

          <div className="demo-hint">
            <strong>Local access</strong>
            <span>admin / nadine123</span>
            <span>cashier / cashier123</span>
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
        <div className="side-brand">
          <div className="brand-mark small">
            <Package />
          </div>
          <div>
            <strong>NADINE&apos;S</strong>
            <span>SHOP MANAGEMENT</span>
          </div>
        </div>

        <div className="side-section">
          <small>WORKSPACE</small>
          {[
            { label: 'Dashboard', icon: LayoutDashboard },
            { label: 'Sales', icon: ShoppingCart },
            { label: 'Inventory', icon: Boxes },
            { label: 'Finances', icon: CircleDollarSign },
            { label: 'Reports', icon: BarChart3 },
          ].map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={page === label ? 'nav-item active' : 'nav-item'}
              onClick={() => {
                setPage(label)
                setMobileNav(false)
              }}
            >
              <Icon />
              {label}
              <ChevronRight className="nav-arrow" />
            </button>
          ))}
        </div>

        <div className="side-section">
          <small>QUICK ACTIONS</small>
          <button className="nav-item" onClick={() => setShowSale(true)}>
            <Plus />
            New sale
          </button>
          <button className="nav-item" onClick={() => setShowProduct(true)}>
            <Package />
            Add product
          </button>
        </div>

        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => void loadData()}>
            <RefreshCw />
            Refresh data
          </button>
          <button className="nav-item" onClick={handleLogout}>
            <LogOut />
            Sign out
          </button>
          <button className="nav-item" onClick={() => setShowPassword(true)}>
            <KeyRound />
            Change password
          </button>

          <div className="user-chip">
            <div className="avatar">N</div>
            <div>
              <strong>Nadine</strong>
              <span>Administrator</span>
            </div>
            <Settings />
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)}>
            <Menu />
          </button>

          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight />
            <strong>{page}</strong>
          </div>

          <div className="top-actions">
            <button className="icon-btn" aria-label="Notifications">
              <Bell />
              <i />
            </button>
            <div className="top-avatar">N</div>
          </div>
        </header>

        <main className="content">
          {page === 'Dashboard' && (
            <Dashboard totals={totals} lowStock={lowStock} sales={sales} products={products} setShowSale={setShowSale} />
          )}
          {page === 'Sales' && (
            <SalesPage sales={sales} products={products} setShowSale={setShowSale} setReceipt={setReceipt} setEditingSale={setEditingSale} deleteSale={deleteSale} search={search} setSearch={setSearch} />
          )}
          {page === 'Inventory' && (
            <Inventory products={products} setShowProduct={setShowProduct} setEditingProduct={setEditingProduct} deleteProduct={deleteProduct} search={search} setSearch={setSearch} />
          )}
          {page === 'Finances' && <FinancePage debts={debts} pettyCash={pettyCash} setShowDebt={setShowDebt} setShowPettyCash={() => setShowPettyCash(true)} onPayDebt={setPayingDebt} />}
          {page === 'Reports' && <Reports products={products} sales={sales} pettyCash={pettyCash} totals={totals} />}
        </main>
      </div>

      {showProduct && (
        <ProductModal
          product={editingProduct}
          close={() => setShowProduct(false)}
          onSave={async (payload) => {
            try {
              if (editingProduct) {
                await updateProduct(editingProduct.id, payload)
              } else {
                await createProduct(payload)
              }
            } catch (error) {
              setLoginError(error instanceof Error ? error.message : 'Unable to add product.')
            }
          }}
        />
      )}

      {editingProduct && !showProduct && (
        <ProductModal
          product={editingProduct}
          close={() => setEditingProduct(null)}
          onSave={async (payload) => {
            try {
              await updateProduct(editingProduct.id, payload)
            } catch (error) {
              setLoginError(error instanceof Error ? error.message : 'Unable to update product.')
            }
          }}
        />
      )}

      {showPassword && <PasswordModal close={() => setShowPassword(false)} onSave={changePassword} />}

      {showSale && (
        <SaleModal
          products={products}
          cart={cart}
          includeVat={includeVat}
          setIncludeVat={setIncludeVat}
          setCart={setCart}
          addToCart={addToCart}
          completeSale={() => {
            void completeSale()
          }}
          completeCreditSale={completeCreditSale}
          close={() => setShowSale(false)}
        />
      )}

      {showDebt && (
        <DebtModal
          close={() => setShowDebt(false)}
          onSave={async (payload) => {
            try {
              await createDebt(payload)
            } catch (error) {
              setLoginError(error instanceof Error ? error.message : 'Unable to add debt.')
            }
          }}
        />
      )}

      {showPettyCash && (
        <PettyCashModal
          close={() => setShowPettyCash(false)}
          onSave={async (payload) => {
            try {
              await createPettyCash(payload)
              setShowPettyCash(false)
            } catch (error) {
              setLoginError(error instanceof Error ? error.message : 'Unable to save petty cash record.')
            }
          }}
        />
      )}

      {receipt && <ReceiptModal sale={receipt} close={() => setReceipt(null)} />}
      {editingSale && <SaleEditModal sale={editingSale} products={products} close={() => setEditingSale(null)} onSave={(items, date, vat) => updateSale(editingSale, items, date, vat)} />}
      {payingDebt && <DebtPaymentModal debt={payingDebt} close={() => setPayingDebt(null)} onPay={(amount) => settleDebt(payingDebt, amount)} />}
    </div>
  )
}

function Header({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">NADINE&apos;S SHOP</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action && (
        <button className="primary-btn compact" onClick={onAction}>
          <Plus />
          {action}
        </button>
      )}
    </div>
  )
}

function Dashboard({ totals, lowStock, sales, products, setShowSale }: any) {
  const [greeting, setGreeting] = useState('Good morning')
  const [stockSearch, setStockSearch] = useState('')
  const [revenueSearch, setRevenueSearch] = useState('')
  const stockListRef = useRef<HTMLDivElement>(null)
  const revenueListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hour = new Date().getHours()
    setGreeting(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')
  }, [])

  const health = useMemo(() => {
    const salesActivity = Math.min(40, sales.length * 8)
    const inventoryHealth = products.length ? Math.round(((products.length - lowStock.length) / products.length) * 30) : 0
    const revenue = Number(totals.sales || 0)
    const profit = Number(totals.profit || 0)
    const marginHealth = revenue > 0 ? Math.round(Math.max(0, Math.min(30, (profit / revenue) * 30))) : 0
    const score = sales.length || products.length ? salesActivity + inventoryHealth + marginHealth : 0

    if (score >= 75) {
      return { score, title: 'Looking good', message: 'Sales, stock and profit are all showing healthy activity.' }
    }
    if (score >= 45) {
      return { score, title: 'Room to grow', message: 'Your shop is active, but some areas need attention.' }
    }
    if (score > 0) {
      return { score, title: 'Needs attention', message: 'Add sales or replenish stock to strengthen your shop health.' }
    }
    return { score: 0, title: 'Waiting for activity', message: 'Your live health score will appear after products or sales are recorded.' }
  }, [lowStock.length, products.length, sales.length, totals.profit, totals.sales])

  const weeklySales = useMemo(() => {
    const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - index))
      return date.toISOString().slice(0, 10)
    })

    return lastSevenDays.map((date) => {
      const revenue = sales
        .filter((entry: Sale) => entry.date === date)
        .reduce((sum: number, entry: Sale) => sum + Number(entry.total ?? 0), 0)

      return {
        date,
        label: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        value: revenue,
      }
    })
  }, [sales])

  const categoryRevenue = useMemo(() => {
    const totalsByCategory = new Map<string, number>()

    for (const entry of sales) {
      for (const item of entry.items ?? []) {
        const product = products.find((candidate: Product) => candidate.name.toLowerCase() === item.name.toLowerCase())
        const category = product?.category ?? 'Other'
        const currentValue = totalsByCategory.get(category) ?? 0
        const revenue = Number(item.price ?? 0) * Number(item.qty ?? 0)
        totalsByCategory.set(category, currentValue + revenue)
      }
    }

    return [...totalsByCategory.entries()]
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value)
  }, [sales, products])

  const maxRevenue = Math.max(...weeklySales.map((entry) => entry.value), 1)
  const categoryTotal = categoryRevenue.reduce((sum, entry) => sum + entry.value, 0)
  const visibleStock = products
    .filter((product: Product) => `${product.name} ${product.category}`.toLowerCase().includes(stockSearch.toLowerCase()))
    .slice()
    .sort((a: Product, b: Product) => (a.stock / Math.max(a.min, 1)) - (b.stock / Math.max(b.min, 1)))
  const visibleRevenue = categoryRevenue.filter(({ category }) =>
    category.toLowerCase().includes(revenueSearch.toLowerCase()) ||
    products.some((product: Product) => product.category === category && product.name.toLowerCase().includes(revenueSearch.toLowerCase())),
  )

  const cards = [
    { label: "Today's sales (excl. VAT)", value: money(totals.todaySales || 0), color: 'teal', icon: ShoppingCart, change: `${sales.length} sales` },
    { label: "Today's profit", value: money(totals.todayProfit || 0), color: 'green', icon: TrendingUp, change: 'After petty cash' },
    { label: 'VAT payable', value: money(totals.todayVat || 0), color: 'amber', icon: CircleDollarSign, change: 'From included VAT' },
    { label: 'Customers owe', value: money(totals.owed), color: 'amber', icon: Users, change: 'Open customer debts' },
    { label: 'Low stock items', value: lowStock.length, color: 'red', icon: AlertTriangle, change: 'Needs attention' },
  ]

  return (
    <>
      <Header title={`${greeting}, Nadine`} subtitle="Here is what is happening in your shop today." action="New sale" onAction={() => setShowSale(true)} />
      <div className="stat-grid">
        {cards.map(({ label, value, color, icon: Icon, change }) => (
          <div className="stat-card" key={label}>
            <div className={`stat-icon ${color}`}>
              <Icon />
            </div>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small className={color === 'red' ? 'negative' : 'positive'}>{change}</small>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="panel sales-chart">
          <div className="panel-head">
            <div>
              <h2>Sales performance</h2>
              <p>Revenue across the last 7 days</p>
            </div>
            <span className="status-pill">Live</span>
          </div>
          <div className="chart">
            <div className="y-labels">
              <span>{money(maxRevenue)}</span>
              <span>{money(maxRevenue * 0.75)}</span>
              <span>{money(maxRevenue * 0.5)}</span>
              <span>{money(maxRevenue * 0.25)}</span>
              <span>0</span>
            </div>
            <div className="bars">
              {weeklySales.map((entry) => (
                <div className="bar-col" key={entry.date} data-label={money(entry.value)}>
                  <div className="bar-track">
                    <div className="bar" style={{ height: `${Math.max(12, (entry.value / maxRevenue) * 100)}%` }} />
                  </div>
                  <span>{entry.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel health">
          <div className="panel-head">
            <div>
              <h2>Business health</h2>
              <p>Based on your current activity</p>
            </div>
            <span className="status-dot">Live</span>
          </div>
          <div className="health-score">
            <div className="score-ring">
              {health.score}<span>/100</span>
            </div>
            <div>
              <strong>{health.title}</strong>
              <p>{health.message}</p>
            </div>
          </div>
          <div className="health-list">
            <span>
              <i className="dot green-dot" /> {sales.length} recorded sale{sales.length === 1 ? '' : 's'}
            </span>
            <span>
              <i className="dot amber-dot" /> {lowStock.length} low-stock item{lowStock.length === 1 ? '' : 's'}
            </span>
            <span>
              <i className="dot teal-dot" /> {products.length} product{products.length === 1 ? '' : 's'} tracked
            </span>
          </div>
        </div>
      </div>

      <div className="bottom-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Quick stock check</h2>
              <p>Prioritise products that need attention</p>
            </div>
            <span className="count-badge teal-bg">{products.length}</span>
          </div>
          <BrowseControls count={products.length} query={stockSearch} onQueryChange={setStockSearch} scrollRef={stockListRef} placeholder="Search products..." />
          <div className={`stock-check-list ${products.length > 3 ? 'side-scroll-list' : ''}`} ref={stockListRef}>
            {visibleStock.length ? visibleStock.map((product: Product) => (
              <div className="stock-check-row" key={product.id}>
                <div className="stock-check-icon"><Package /></div>
                <div className="stock-check-info">
                  <strong>{product.name}</strong>
                  <span>{product.stock} {product.unit} left · reorder at {product.min}</span>
                  <i><b className={product.stock <= product.min ? 'low' : ''} style={{ width: `${Math.min(100, (product.stock / Math.max(product.min * 3, 1)) * 100)}%` }} /></i>
                </div>
                <span className={product.stock <= product.min ? 'badge warning' : 'badge success'}>{product.stock <= product.min ? 'Restock' : 'Healthy'}</span>
              </div>
            )) : <div className="empty-state">{products.length ? 'No matching products.' : 'No products have been added yet.'}</div>}
          </div>
        </div>

        <div className="panel category-revenue-panel">
          <div className="panel-head">
            <div>
              <h2>Revenue mix</h2>
              <p>Sales grouped by product category</p>
            </div>
            <span className="category-revenue-total">{money(categoryTotal)}</span>
          </div>
          <BrowseControls count={products.length} query={revenueSearch} onQueryChange={setRevenueSearch} scrollRef={revenueListRef} placeholder="Search categories or products..." />
          <div className={`category-revenue-list ${products.length > 3 ? 'side-scroll-list' : ''}`} ref={revenueListRef}>
            {visibleRevenue.length ? (
              visibleRevenue.map(({ category, value }, index) => (
                <div className={`category-revenue-row tone-${index % 4}`} key={category}>
                  <div className="category-revenue-heading">
                    <span className="category-rank">{String(index + 1).padStart(2, '0')}</span>
                    <strong>{category}</strong>
                    <span className="category-revenue-value">{money(value)}</span>
                  </div>
                  <div className="category-revenue-track"><i style={{ width: `${Math.max(4, (value / Math.max(...categoryRevenue.map((entry) => entry.value), 1)) * 100)}%` }} /></div>
                  <small>{categoryTotal ? `${Math.round((value / categoryTotal) * 100)}% of category revenue` : 'No revenue yet'}</small>
                </div>
              ))
            ) : (
              <div className="category-revenue-empty">
                <div className="empty-chart-mark"><BarChart3 /></div>
                <strong>{categoryRevenue.length ? 'No matching categories' : 'No category sales yet'}</strong>
                <span>{categoryRevenue.length ? 'Try another product or category name.' : 'Category revenue will appear after a sale is recorded.'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function BrowseControls({
  count,
  query,
  onQueryChange,
  scrollRef,
  placeholder,
}: {
  count: number
  query: string
  onQueryChange: (value: string) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  placeholder: string
}) {
  if (count <= 3) return null

  const scroll = (direction: -1 | 1) => {
    const list = scrollRef.current
    if (list) list.scrollBy({ top: direction * list.clientHeight * 0.8, behavior: 'smooth' })
  }

  return (
    <div className="list-browse-controls">
      <label className="list-search-box">
        <Search />
        <input aria-label={placeholder} placeholder={placeholder} value={query} onChange={(event) => onQueryChange(event.target.value)} />
      </label>
      <div className="list-scroll-buttons">
        <button type="button" aria-label="Scroll list up" title="Scroll up" onClick={() => scroll(-1)}><ChevronUp /></button>
        <button type="button" aria-label="Scroll list down" title="Scroll down" onClick={() => scroll(1)}><ChevronDown /></button>
      </div>
    </div>
  )
}

function SalesPage({ sales, products, setShowSale, setReceipt, setEditingSale, deleteSale, search, setSearch }: any) {
  const visibleSales = sales.filter((entry: Sale) => entry.id.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <Header title="Sales history" subtitle="Review transactions, revenue and profit from your shop." action="New sale" onAction={() => setShowSale(true)} />
      <div className="toolbar">
        <div className="search-box">
          <Search />
          <input placeholder="Search receipts..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select>
          <option>All dates</option>
          <option>This week</option>
        </select>
      </div>

      <div className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Date</th>
              <th>Items</th>
              <th>Total</th>
              <th>Profit</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleSales.map((entry: Sale) => (
              <tr key={entry.id}>
                <td>
                  <strong>{entry.id}</strong>
                </td>
                <td>{entry.date}</td>
                <td>{entry.items.reduce((sum, item) => sum + item.qty, 0)} items</td>
                <td>
                  <strong>{money(entry.total)}</strong>
                </td>
                <td className="green-text">+{money(entry.profit)}</td>
                <td><span className="badge success"><Check />{entry.creditDebtId ? 'Credit payment' : 'Cash'}</span></td>
                <td>
                  <button className="icon-btn" onClick={() => setReceipt(entry)}>
                    <FileText />
                  </button>
                  {!entry.creditDebtId && <button className="icon-btn" title="Edit sale" onClick={() => setEditingSale({
                    ...entry,
                    items: entry.items.map((item) => ({
                      ...item,
                      productId: item.productId ?? products.find((product: Product) => product.name === item.name)?.id,
                    })),
                  })}><Pencil /></button>}
                  <button className="icon-btn danger-icon" title={entry.creditDebtId ? 'Reverse debt payment' : 'Delete sale'} onClick={() => void deleteSale(entry)}><Trash2 /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Inventory({ products, setShowProduct, setEditingProduct, deleteProduct, search, setSearch }: any) {
  const visibleProducts = products.filter((product: Product) => product.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <Header title="Inventory" subtitle="Manage your products, stock levels and pricing." action="Add product" onAction={() => setShowProduct(true)} />
      <div className="toolbar">
        <div className="search-box">
          <Search />
          <input placeholder="Search products..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select>
          <option>All categories</option>
          <option>Groceries</option>
          <option>Drinks</option>
          <option>Other</option>
        </select>
      </div>

      <div className="inventory-grid">
        {visibleProducts.map((product: Product) => (
          <div className="inventory-card" key={product.id}>
            <div className="inventory-card-top">
              <div className="product-icon large">
                <Package />
              </div>
              <span className={product.stock <= product.min ? 'badge warning' : 'badge success'}>
                {product.stock <= product.min ? 'Low stock' : 'In stock'}
              </span>
            </div>
            <h3>{product.name}</h3>
            <p>
              {product.category} · per {product.unit}
            </p>
            <div className="stock-number">
              <strong>{product.stock}</strong>
              <span>{product.unit} available</span>
            </div>
            <div className="stock-bar">
              <i className={product.stock <= product.min ? 'low' : ''} style={{ width: `${Math.min(100, (product.stock / Math.max(product.min * 4, 1)) * 100)}%` }} />
            </div>
            <div className="price-row">
              <span>
                Buy <strong>{money(product.buy)}</strong>
              </span>
              <span>
                Sell <strong>{money(product.sell)}</strong>
              </span>
            </div>
            <div className="inventory-actions">
              <button className="outline-btn" onClick={() => setEditingProduct(product)}>
                <Pencil /> Edit
              </button>
              <button className="danger-btn" onClick={() => void deleteProduct(product)}>
                <Trash2 /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function DebtPaymentModal({ debt, close, onPay }: { debt: Debt; close: () => void; onPay: (amount: number) => Promise<void> }) {
  const [amount, setAmount] = useState(String(debt.amount))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const payment = Number(amount)
  const remaining = Math.max(0, Number(debt.amount) - (Number.isFinite(payment) ? payment : 0))

  const submit = async () => {
    setError('')
    if (!Number.isFinite(payment) || payment <= 0 || payment > debt.amount) {
      setError(`Enter a whole RWF amount between 1 and ${money(debt.amount)}.`)
      return
    }
    setSaving(true)
    try {
      await onPay(payment)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to record payment.')
      setSaving(false)
    }
  }

  return (
    <Modal title={`Receive payment from ${debt.name}`} close={close}>
      <div className="payment-balance">
        <span>Outstanding debt</span><strong>{money(debt.amount)}</strong>
        {Number(debt.paidAmount ?? 0) > 0 && <small>Previously paid: {money(debt.paidAmount ?? 0)}</small>}
      </div>
      <div className="form-grid">
        <label>Amount being paid<input type="number" min="1" max={debt.amount} step="1" autoFocus value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      </div>
      <div className="payment-remaining"><span>Balance remaining after payment</span><strong>{money(remaining)}</strong></div>
      {error ? <div className="error-text">{error}</div> : null}
      <button className="primary-btn full" disabled={saving || !Number.isFinite(payment) || payment <= 0 || payment > debt.amount} onClick={() => void submit()}>{saving ? 'Recording payment…' : `Record ${money(payment || 0)} payment`} <Check /></button>
    </Modal>
  )
}

function FinancePage({ debts, pettyCash, setShowDebt, setShowPettyCash, onPayDebt }: any) {
  const customers = debts.filter((item: Debt) => item.kind === 'customer')
  const suppliers = debts.filter((item: Debt) => item.kind === 'supplier')
  const [customerSearch, setCustomerSearch] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [pettyCashSearch, setPettyCashSearch] = useState('')
  const customerListRef = useRef<HTMLDivElement>(null)
  const supplierListRef = useRef<HTMLDivElement>(null)
  const pettyCashListRef = useRef<HTMLDivElement>(null)
  const visibleCustomers = customers.filter((entry: Debt) => `${entry.name} ${entry.phone ?? ''} ${entry.description ?? ''}`.toLowerCase().includes(customerSearch.toLowerCase()))
  const visibleSuppliers = suppliers.filter((entry: Debt) => `${entry.name} ${entry.phone ?? ''} ${entry.description ?? ''}`.toLowerCase().includes(supplierSearch.toLowerCase()))
  const visiblePettyCash = pettyCash.filter((entry: PettyCash) => `${entry.reason} ${entry.date} ${entry.amount}`.toLowerCase().includes(pettyCashSearch.toLowerCase()))

  return (
    <>
      <Header title="Finances" subtitle="Keep track of money owed to you, payments you need to make, and cash withdrawn for shop expenses." action="Add debt" onAction={() => setShowDebt(true)} />
      <div className="finance-summary">
        <div>
          <span>Money owed to you</span>
          <strong>{money(customers.reduce((sum: number, entry: Debt) => sum + entry.amount, 0))}</strong>
          <small>From {customers.length} customers</small>
        </div>
        <div>
          <span>Money you owe</span>
          <strong>{money(suppliers.reduce((sum: number, entry: Debt) => sum + entry.amount, 0))}</strong>
          <small>To {suppliers.length} suppliers</small>
        </div>
      </div>

      <div className="debt-columns">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Money owed to me</h2>
              <p>Customer credit accounts</p>
            </div>
            <span className="count-badge teal-bg">{customers.length}</span>
          </div>
          <BrowseControls count={customers.length} query={customerSearch} onQueryChange={setCustomerSearch} scrollRef={customerListRef} placeholder="Search customers..." />
          <div className={`debt-list ${customers.length > 3 ? 'side-scroll-list' : ''}`} ref={customerListRef}>
          {visibleCustomers.length ? visibleCustomers.map((entry: Debt) => (
            <DebtRow key={entry.id} entry={entry} onPayDebt={onPayDebt} />
          )) : <div className="empty-state">{customers.length ? 'No matching customers.' : 'No customer debts recorded.'}</div>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Money I owe</h2>
              <p>Supplier credit accounts</p>
            </div>
            <span className="count-badge amber-bg">{suppliers.length}</span>
          </div>
          <BrowseControls count={suppliers.length} query={supplierSearch} onQueryChange={setSupplierSearch} scrollRef={supplierListRef} placeholder="Search suppliers..." />
          <div className={`debt-list ${suppliers.length > 3 ? 'side-scroll-list' : ''}`} ref={supplierListRef}>
          {visibleSuppliers.length ? visibleSuppliers.map((entry: Debt) => (
            <DebtRow key={entry.id} entry={entry} onPayDebt={onPayDebt} />
          )) : <div className="empty-state">{suppliers.length ? 'No matching suppliers.' : 'No supplier debts recorded.'}</div>}
          </div>
        </div>
      </div>

      <div className="panel petty-cash-panel">
        <div className="panel-head">
          <div className="petty-cash-title">
            <span className="petty-cash-mark"><Wallet /></span>
            <div>
              <h2>Petty cash</h2>
              <p>Shop expenses paid from sales cash</p>
            </div>
          </div>
          <button className="outline-btn" onClick={setShowPettyCash}><Plus /> Record expense</button>
        </div>
        <div className="petty-cash-summary">
          <div><span>Total withdrawals</span><strong>{money(pettyCash.reduce((sum: number, entry: PettyCash) => sum + entry.amount, 0))}</strong></div>
          <span className="petty-cash-count">{pettyCash.length} {pettyCash.length === 1 ? 'expense' : 'expenses'}</span>
        </div>
        <BrowseControls count={pettyCash.length} query={pettyCashSearch} onQueryChange={setPettyCashSearch} scrollRef={pettyCashListRef} placeholder="Search expenses..." />
        <div className={`petty-cash-ledger ${pettyCash.length > 3 ? 'side-scroll-list' : ''}`} ref={pettyCashListRef}>
          {visiblePettyCash.length ? visiblePettyCash.map((entry: PettyCash) => (
            <div className="petty-cash-entry" key={entry.id}>
              <span className="expense-indicator"><Wallet /></span>
              <span className="expense-description"><strong>{entry.reason}</strong><small>{new Date(`${entry.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</small></span>
              <strong className="expense-amount">−{money(entry.amount)}</strong>
            </div>
          )) : pettyCash.length ? <div className="empty-state">No matching expenses.</div> : <div className="petty-cash-empty"><Wallet /><span>No expenses recorded yet</span><small>Your petty cash entries will appear here.</small></div>}
        </div>
      </div>
    </>
  )
}

function DebtRow({ entry, onPayDebt }: { entry: Debt; onPayDebt: (entry: Debt) => void }) {
  const paidAmount = Math.max(0, Number(entry.paidAmount ?? 0))
  const remainingAmount = Math.max(0, Number(entry.amount ?? 0))
  const originalAmount = Math.max(Number(entry.original ?? 0), paidAmount + remainingAmount, 1)
  const isCustomer = entry.kind === 'customer'
  const isCleared = isCustomer && (entry.status === 'paid' || remainingAmount === 0)
  const paidPercent = isCleared ? 100 : Math.min(100, (paidAmount / originalAmount) * 100)

  return (
    <div className="debt-row side-scroll-item">
      <div className="debt-avatar">{entry.name[0]}</div>
      <div className="debt-info">
        <div className="debt-person-title">
          <strong>{entry.name}</strong>
          {isCustomer ? <span className={`debt-state-pill ${isCleared ? 'is-cleared' : paidAmount > 0 ? 'is-partial' : 'is-unpaid'}`}>
            {isCleared ? <><Check /> Cleared</> : entry.status === 'settling' ? 'Processing' : paidAmount > 0 ? 'Partially paid' : 'Unpaid'}
          </span> : null}
        </div>
        <span>{entry.description || entry.phone || 'Supplier account'} · Due {entry.due}</span>
        {isCustomer ? (
          <div className="debt-payment-progress">
            <div className="debt-payment-meta">
              <span>Paid so far</span>
              <strong>{money(paidAmount)} <small>of {money(originalAmount)}</small></strong>
            </div>
            <div className="debt-progress" role="progressbar" aria-label={`Payment progress for ${entry.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(paidPercent)}>
              <i style={{ width: `${paidPercent}%` }} />
            </div>
          </div>
        ) : (
          <div className="debt-progress">
            <i style={{ width: `${Math.max(8, (1 - entry.amount / Math.max(entry.original, 1)) * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="debt-amount">
        {isCustomer ? <>
          <span className="debt-remaining-label">{isCleared ? 'Remaining' : 'Remaining to pay'}</span>
          <strong className={`debt-remaining-value ${isCleared ? 'is-cleared' : ''}`}>{money(remainingAmount)}</strong>
          {isCleared ? <span className="debt-cleared-note"><Check /> Paid in full</span> : <button className="outline-btn settle-debt" disabled={entry.status === 'settling'} onClick={() => onPayDebt(entry)}>{entry.status === 'settling' ? 'Processing' : 'Pay now'}</button>}
        </> : <strong>{money(entry.amount)}</strong>}
      </div>
    </div>
  )
}

function Reports({ sales, products, pettyCash, totals }: any) {
  const [range, setRange] = useState<'day' | 'week' | 'month'>('day')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))

  const report = useMemo(() => {
    const anchor = new Date(`${selectedDate}T12:00:00`)
    const start = new Date(anchor)
    if (range === 'week') start.setDate(start.getDate() - 6)
    if (range === 'month') start.setDate(1)
    const startDate = start.toISOString().slice(0, 10)
    const entries = sales.filter((entry: Sale) => entry.date >= startDate && entry.date <= selectedDate)
    const revenue = entries.reduce((sum: number, entry: Sale) => sum + (entry.vat ? Number(entry.total || 0) / 1.18 : Number(entry.total || 0)), 0)
    const vat = entries.reduce((sum: number, entry: Sale) => sum + (entry.vat ? Number(entry.total || 0) - Number(entry.total || 0) / 1.18 : 0), 0)
    const salesProfit = entries.reduce((sum: number, entry: Sale) => sum + Number(entry.profit || 0), 0)
    const cost = entries.flatMap((entry: Sale) => entry.items).reduce((sum: number, item: Sale['items'][number]) => sum + Number(item.buy || 0) * Number(item.qty || 0), 0)
    const pettyTotal = pettyCash.filter((entry: PettyCash) => entry.date >= startDate && entry.date <= selectedDate).reduce((sum: number, entry: PettyCash) => sum + Number(entry.amount || 0), 0)
    const profit = salesProfit - pettyTotal
    return { entries, revenue, vat, pettyTotal, profit, cost, loss: Math.max(0, -profit), startDate }
  }, [range, selectedDate, sales, pettyCash])

  return (
    <>
      <Header title="Reports & insights" subtitle="Understand what is driving your shop performance." />
      <div className="report-controls panel">
        <label>Report period
          <select value={range} onChange={(event) => setRange(event.target.value as 'day' | 'week' | 'month')}>
            <option value="day">Today</option>
            <option value="week">Last 7 days</option>
            <option value="month">This month</option>
          </select>
        </label>
        <label>As of date
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
        </label>
        <button className="primary-btn compact" onClick={() => window.print()}><Printer /> Print report</button>
      </div>

      <div className="report-kpis">
        <div>
          <span>Total revenue</span>
          <strong>{money(report.revenue)}</strong>
          <small>{report.entries.length} sale{report.entries.length === 1 ? '' : 's'} in period</small>
        </div>
        <div>
          <span>Cost of goods</span>
          <strong>{money(report.cost)}</strong>
          <small>Cost of goods sold</small>
        </div>
        <div>
          <span>Gross profit</span>
          <strong className={report.profit >= 0 ? 'green-text' : 'negative'}>{money(report.profit)}</strong>
          <small>{report.profit >= 0 ? 'Net profit' : `Loss: ${money(report.loss)}`}</small>
        </div>
      </div>

      <div className="financial-document panel" id="financial-report">
        <div className="document-head">
          <div><span className="eyebrow">NADINE&apos;S SHOP</span><h2>Financial statement</h2><p>{report.startDate} to {selectedDate}</p></div>
          <FileText />
        </div>
        <div className="document-grid">
          <div><span>Sales revenue</span><strong>{money(report.revenue)}</strong></div>
          <div><span>Cost of goods sold</span><strong>{money(report.cost)}</strong></div>
          <div><span>Gross profit</span><strong className={report.profit >= 0 ? 'green-text' : 'negative'}>{money(report.profit)}</strong></div>
          <div><span>VAT payable</span><strong>{money(report.vat)}</strong></div>
          <div><span>Petty cash withdrawn</span><strong className="negative">−{money(report.pettyTotal)}</strong></div>
          <div><span>Customer receivables</span><strong>{money(totals.owed)}</strong></div>
          <div><span>Supplier payables</span><strong>{money(totals.owe)}</strong></div>
          <div><span>Inventory at cost</span><strong>{money(products.reduce((sum: number, product: Product) => sum + product.stock * product.buy, 0))}</strong></div>
        </div>
      </div>

      <div className="panel table-panel">
        <div className="panel-head">
          <div>
            <h2>Product performance</h2>
            <p>Profit contribution by product</p>
          </div>
          <select>
            <option>This month</option>
            <option>This week</option>
          </select>
        </div>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Revenue</th>
              <th>Cost</th>
              <th>Profit</th>
              <th>Margin</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product: Product) => (
              <tr key={product.id}>
                <td>
                  <strong>{product.name}</strong>
                </td>
                <td>{money(report.entries.flatMap((entry: Sale) => entry.items).filter((item: Sale['items'][number]) => item.name === product.name).reduce((sum: number, item: Sale['items'][number]) => sum + item.price * item.qty, 0))}</td>
                <td>{money(report.entries.flatMap((entry: Sale) => entry.items).filter((item: Sale['items'][number]) => item.name === product.name).reduce((sum: number, item: Sale['items'][number]) => sum + item.buy * item.qty, 0))}</td>
                <td className="green-text">+{money(report.entries.flatMap((entry: Sale) => entry.items).filter((item: Sale['items'][number]) => item.name === product.name).reduce((sum: number, item: Sale['items'][number]) => sum + (item.price - item.buy) * item.qty, 0))}</td>
                <td>
                  <span className="margin-bar">
                    <i style={{ width: `${Math.max(0, Math.min(100, ((product.sell - product.buy) / Math.max(product.sell, 1)) * 100))}%` }} />
                  </span>
                  {Math.round(((product.sell - product.buy) / Math.max(product.sell, 1)) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function SaleEditModal({ sale, close, onSave }: { sale: Sale; products: Product[]; close: () => void; onSave: (items: Sale['items'], date: string, vat: boolean) => Promise<void> }) {
  const [items, setItems] = useState(sale.items)
  const [date, setDate] = useState(sale.date)
  const [vat, setVat] = useState(sale.vat)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(items, date, vat)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update sale.')
      setSaving(false)
    }
  }

  return (
    <Modal title={`Edit sale ${sale.id}`} close={close}>
      <div className="form-grid sale-edit-fields">
        <label>Sale date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label className="inline-checkbox"><input type="checkbox" checked={vat} onChange={(event) => setVat(event.target.checked)} /> VAT included</label>
      </div>
      <div className="sale-edit-items">
        {items.map((item, index) => <div className="cart-row" key={`${item.productId}-${item.name}`}>
          <span>{item.name}<small>{money(item.price)} / {item.unit}</small></span>
          <div className="cart-actions sale-edit-price">
            <label>Price<input aria-label={`${item.name} selling price`} type="number" min="0" value={item.price} onChange={(event) => {
              const price = Math.max(0, Number(event.target.value))
              setItems((current) => current.map((currentItem, currentIndex) => currentIndex === index ? { ...currentItem, price } : currentItem))
            }} /></label>
            <input aria-label={`${item.name} quantity`} type="number" min="0" step={getQuantityStep(item.unit)} value={item.qty} onChange={(event) => {
              const qty = normalizeQuantity(Number(event.target.value), item.unit)
              setItems((current) => current.map((currentItem, currentIndex) => currentIndex === index ? { ...currentItem, qty } : currentItem))
            }} />
            <button className="icon-btn danger-icon" aria-label={`Remove ${item.name}`} onClick={() => setItems((current) => current.filter((_, currentIndex) => currentIndex !== index))}><X /></button>
          </div>
        </div>)}
      </div>
      {error ? <div className="error-text">{error}</div> : null}
      <button className="primary-btn full" disabled={saving || !items.some((item) => item.qty > 0)} onClick={() => void save()}>{saving ? 'Saving…' : 'Save sale changes'} <Check /></button>
    </Modal>
  )
}

function SaleModal({ products, cart, setCart, addToCart, includeVat, setIncludeVat, completeSale, completeCreditSale, close }: any) {
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [error, setError] = useState('')
  const subtotal = cart.reduce((sum: number, item: CartItem) => sum + item.product.sell * item.qty, 0)
  const visibleProducts = products.filter((product: Product) =>
    product.name.toLowerCase().includes(productSearch.trim().toLowerCase()),
  )

  const changeQuantity = (productId: number, unit: string, delta: number) => {
    setCart((current: CartItem[]) =>
      current
        .map((item) => {
          if (item.product.id !== productId) {
            return item
          }

          const nextQty = Math.min(item.product.stock, normalizeQuantity(item.qty + delta, unit))
          return { ...item, qty: nextQty }
        })
        .filter((item) => item.qty > 0),
    )
  }

  return (
    <Modal title="New sale" close={close}>
      <div className="sale-layout">
        <div>
          <fieldset className="payment-choice">
            <legend>Payment type</legend>
            <label><input type="radio" checked={paymentType === 'cash'} onChange={() => setPaymentType('cash')} /> Cash sale</label>
            <label><input type="radio" checked={paymentType === 'credit'} onChange={() => setPaymentType('credit')} /> Sale on debt</label>
          </fieldset>
          {paymentType === 'credit' && <div className="credit-customer-fields">
            <label>Customer name<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Name of customer" /></label>
            <label>Phone (optional)<input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Phone number" /></label>
          </div>}
          <label>Choose products</label>
          {products.length > 3 && (
            <div className="sale-product-search">
              <Search />
              <input
                type="search"
                placeholder="Search products..."
                aria-label="Search sale products"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
              />
            </div>
          )}
          <div className={products.length > 3 ? 'product-picker product-picker-scroll' : 'product-picker'}>
            {visibleProducts.map((product: Product) => (
              <button key={product.id} disabled={product.stock <= 0} onClick={() => addToCart(product)}>
                <Package />
                <span>
                  {product.name}
                  <small>
                    {money(product.sell)} / {product.unit} · {product.stock} {product.unit} in stock
                  </small>
                </span>
                {product.stock > 0 ? <Plus /> : <span className="out-of-stock">Out of stock</span>}
              </button>
            ))}
            {!visibleProducts.length && <div className="empty-state">No matching products.</div>}
          </div>
        </div>

        <div className="cart-box">
          <h3>
            Current sale <span>{cart.length} items</span>
          </h3>
          {cart.length ? (
            cart.map((item: CartItem) => {
              const step = getQuantityStep(item.product.unit)
              return (
                <div className="cart-row" key={item.product.id}>
                  <span>
                    {item.product.name}
                    <small>
                      {money(item.product.sell)} × {formatQuantity(item.qty, item.product.unit)}
                    </small>
                  </span>
                  <div className="cart-actions">
                    <div className="quantity-controls">
                      <button type="button" onClick={() => changeQuantity(item.product.id, item.product.unit, -step)} aria-label={`Decrease ${item.product.name}`}>
                        −
                      </button>
                      <input
                        type="number"
                        min="0"
                        max={item.product.stock}
                        step={step}
                        value={item.qty}
                        onChange={(event) => {
                              const nextQty = Math.min(item.product.stock, Number(event.target.value))
                          if (!Number.isNaN(nextQty)) {
                            setCart((current: CartItem[]) =>
                              current
                                .map((entry) =>
                                  entry.product.id === item.product.id
                                    ? { ...entry, qty: normalizeQuantity(nextQty, item.product.unit) }
                                    : entry,
                                )
                                .filter((entry) => entry.qty > 0),
                            )
                          }
                        }}
                      />
                      <button type="button" onClick={() => changeQuantity(item.product.id, item.product.unit, step)} aria-label={`Increase ${item.product.name}`}>
                        +
                      </button>
                    </div>
                    <strong>{money(item.product.sell * item.qty)}</strong>
                    <button onClick={() => setCart((current: CartItem[]) => current.filter((entry) => entry.product.id !== item.product.id))}>
                      <X />
                    </button>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="empty-cart">
              <ShoppingCart />
              <span>Add products to start a sale</span>
            </div>
          )}

          <div className="sale-totals">
            <span>
              Subtotal <strong>{money(subtotal)}</strong>
            </span>
            <label>
              <input type="checkbox" checked={includeVat} onChange={(event) => setIncludeVat(event.target.checked)} />
              Include 18% VAT <strong>{money(includeVat ? subtotal * 0.18 : 0)}</strong>
            </label>
            <span className="grand-total">
              Total <strong>{money(subtotal * (includeVat ? 1.18 : 1))}</strong>
            </span>
          </div>

          {paymentType === 'cash' ? (
            <button className="primary-btn full" onClick={completeSale} disabled={!cart.length}>Complete cash sale <ChevronRight /></button>
          ) : (
            <button className="primary-btn full" disabled={!cart.length || !customerName.trim()} onClick={async () => {
              setError('')
              try {
                await completeCreditSale({ name: customerName.trim(), phone: customerPhone.trim() || undefined })
              } catch (saveError) {
                setError(saveError instanceof Error ? saveError.message : 'Unable to record credit sale.')
              }
            }}>Record sale on debt <ChevronRight /></button>
          )}
          {error ? <div className="error-text">{error}</div> : null}
        </div>
      </div>
    </Modal>
  )
}

function ProductModal({ product, close, onSave }: { product?: Product | null; close: () => void; onSave: (payload: { name: string; category: string; stock: number; unit: string; buy: number; sell: number; min: number }) => Promise<void> }) {
  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState(product?.category ?? 'Groceries')
  const [stock, setStock] = useState(product ? String(product.stock) : '')
  const [unit, setUnit] = useState(product?.unit ?? 'pieces')
  const [buy, setBuy] = useState(product ? String(product.buy) : '')
  const [sell, setSell] = useState(product ? String(product.sell) : '')
  const [min, setMin] = useState(product ? String(product.min) : '5')

  const save = async () => {
    const payload = {
      name: name.trim(),
      category,
      stock: Number(stock || 0),
      unit,
      buy: Number(buy || 0),
      sell: Number(sell || 0),
      min: Number(min || 5),
    }
    if (!payload.name || payload.stock < 0) {
      return
    }
    await onSave(payload)
    close()
  }

  return (
    <Modal title={product ? 'Edit product' : 'Add product'} close={close}>
      <div className="form-grid">
        <label>
          Product name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Mineral Water" />
        </label>
        <label>
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option>Groceries</option>
            <option>Drinks</option>
            <option>Other</option>
          </select>
        </label>
        <label>
          Opening stock
          <input type="number" value={stock} onChange={(event) => setStock(event.target.value)} placeholder="0" />
        </label>
        <label>
          Unit
          <select value={unit} onChange={(event) => setUnit(event.target.value)}>
            <option>pieces</option>
            <option>bottles</option>
            <option>kg</option>
            <option>liters</option>
          </select>
        </label>
        <label>
          Buying price
          <input type="number" value={buy} onChange={(event) => setBuy(event.target.value)} placeholder="RWF" />
        </label>
        <label>
          Selling price
          <input type="number" value={sell} onChange={(event) => setSell(event.target.value)} placeholder="RWF" />
        </label>
        <label>
          Reorder level
          <input type="number" value={min} onChange={(event) => setMin(event.target.value)} placeholder="5" />
        </label>
      </div>
      <button className="primary-btn full" onClick={() => void save()}>
        {product ? 'Update product' : 'Save product'} <Check />
      </button>
    </Modal>
  )
}

function PasswordModal({ close, onSave }: { close: () => void; onSave: (currentPassword: string, newPassword: string) => Promise<void> }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const save = async () => {
    setError('')
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }
    try {
      await onSave(currentPassword, newPassword)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to change password.')
    }
  }

  return (
    <Modal title="Change password" close={close}>
      <div className="form-grid">
        <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
        <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 6 characters" /></label>
        <label>Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
      </div>
      {error ? <div className="error-text">{error}</div> : null}
      <button className="primary-btn full" onClick={() => void save()}>Update password <KeyRound /></button>
    </Modal>
  )
}

function DebtModal({ close, onSave }: { close: () => void; onSave: (payload: { name: string; phone?: string; amount: number; kind: 'customer' | 'supplier'; due: string; description?: string }) => Promise<void> }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<'customer' | 'supplier'>('customer')
  const [description, setDescription] = useState('')
  const [due, setDue] = useState(new Date().toISOString().slice(0, 10))

  const save = async () => {
    if (!name.trim() || !amount) {
      return
    }
    await onSave({
      name: name.trim(),
      phone: phone || undefined,
      amount: Number(amount),
      kind,
      due,
      description: description.trim() || undefined,
    })
    close()
  }

  return (
    <Modal title="Add debt account" close={close}>
      <div className="form-grid">
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer or supplier" />
        </label>
        <label>
          Phone
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Optional" />
        </label>
        <label>
          Account type
          <select value={kind} onChange={(event) => setKind(event.target.value as 'customer' | 'supplier')}>
            <option value="customer">They owe me</option>
            <option value="supplier">I owe them</option>
          </select>
        </label>
        <label>
          Amount owed
          <input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="RWF" />
        </label>
        <label>
          What is this debt for?
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Reason or items" />
        </label>
        <label>
          Due date
          <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
        </label>
      </div>
      <button className="primary-btn full" onClick={() => void save()}>
        Save account <Check />
      </button>
    </Modal>
  )
}

function PettyCashModal({ close, onSave }: { close: () => void; onSave: (payload: { amount: number; reason: string; date: string }) => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const save = async () => {
    if (!amount || !reason.trim()) {
      return
    }
    await onSave({ amount: Number(amount), reason: reason.trim(), date })
  }

  return (
    <Modal title="Record petty cash withdrawal" close={close}>
      <div className="form-grid">
        <label>Amount withdrawn<input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="RWF" /></label>
        <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Bought packaging materials" /></label>
      </div>
      <button className="primary-btn full" onClick={() => void save()}>Save withdrawal <Wallet /></button>
    </Modal>
  )
}

function ReceiptModal({ sale, close }: { sale: Sale; close: () => void }) {
  return (
    <Modal title="Sale receipt" close={close}>
      <div className="receipt" id="print-receipt">
        <div className="receipt-head">
          <strong>NADINE&apos;S SHOP</strong>
          <span>Shop Management System</span>
          <small>
            Receipt No: {sale.id}
            <br />
            {sale.date}
          </small>
        </div>

        {sale.items.map((item) => (
          <div className="receipt-line" key={`${sale.id}-${item.name}-${item.price}`}>
            <span>
              {item.name}
              <small>
                {item.qty} {item.unit} × {money(item.price)}
              </small>
            </span>
            <strong>{money(item.qty * item.price)}</strong>
          </div>
        ))}

        <div className="receipt-total">
          <span>
            Subtotal <strong>{money(sale.total / (sale.vat ? 1.18 : 1))}</strong>
          </span>
          {sale.vat && (
            <span>
              VAT (18%) <strong>{money(sale.total - sale.total / 1.18)}</strong>
            </span>
          )}
          <span className="total">
            Total <strong>{money(sale.total)}</strong>
          </span>
        </div>

        <p>Thank you for shopping with us.</p>
      </div>

      <button className="primary-btn full" onClick={() => window.print()}>
        <Printer /> Print receipt
      </button>
    </Modal>
  )
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}