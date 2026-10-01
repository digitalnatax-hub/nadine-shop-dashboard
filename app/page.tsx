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

type ProductFormInput = Omit<Product, 'id'> & {
  openingPayment?: 'cash' | 'credit'
  supplier?: string
  paymentMethod?: string
}

type Sale = {
  id: string
  date: string
  items: { productId?: number; name: string; qty: number; unit: string; price: number; buy: number }[]
  total: number
  profit: number
  vat: boolean
  creditDebtId?: number
  vatAmount?: number
  customer?: string
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'payment'
  amountPaid?: number
  customerBalance?: number
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
  type: 'expense' | 'business_expense_payment' | 'other_expense' | 'other_income' | 'transfer' | 'owner_drawing' | 'owner_contribution' | 'bank_transfer_in' | 'cash_transfer_in' | 'supplier_payment' | 'customer_payment' | 'inventory_purchase_payment' | 'cash_in'
  category?: string
  vatAmount?: number
  paymentMethod?: string
  reference?: string
  user?: string
  runningBalance?: number
}

type InventoryPurchase = {
  id: string
  date: string
  supplier: string
  total: number
  paidAmount: number
  vatAmount: number
  paymentMethod: string
  items: { productId: number; name: string; qty: number; unit: string; unitCost: number }[]
}

type DebtPayment = {
  id: string
  debtId: number
  kind: 'customer' | 'supplier'
  amount: number
  paymentMethod: string
  date: string
  reference?: string
}

type BusinessExpense = {
  id: string
  date: string
  category: string
  description: string
  supplier: string
  amountExclVat: number
  vatAmount: number
  total: number
  paidAmount: number
  paymentStatus: 'paid' | 'partial' | 'unpaid'
  paymentMethod: string
}

type CartItem = {
  product: Product
  qty: number
}

const money = (value: number) => `${Math.round(value).toLocaleString('en-US')} RWF`
const getLocalDateInputValue = () => {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

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

const getSaleVat = (sale: Sale) => Number(sale.vatAmount ?? (sale.vat ? Number(sale.total) - Number(sale.total) / 1.18 : 0))
const getSaleRevenue = (sale: Sale) => Number(sale.total) - getSaleVat(sale)

export default function Page() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null)
  const deleteConfirmationResolver = useRef<((confirmed: boolean) => void) | null>(null)
  const [page, setPage] = useState('Dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [pettyCash, setPettyCash] = useState<PettyCash[]>([])
  const [purchases, setPurchases] = useState<InventoryPurchase[]>([])
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([])
  const [accountBalances, setAccountBalances] = useState({ cash: 0, bank: 0, mobile_money: 0, other: 0 })
  const [cashMovements, setCashMovements] = useState<{ id: string; date: string; account: string; type: string; amount: number; reference: string; user?: string }[]>([])
  const [businessExpenses, setBusinessExpenses] = useState<BusinessExpense[]>([])
  const [showProduct, setShowProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showSale, setShowSale] = useState(false)
  const [showDebt, setShowDebt] = useState(false)
  const [showPettyCash, setShowPettyCash] = useState(false)
  const [pettyCashAction, setPettyCashAction] = useState<'receive' | 'withdraw' | 'drawing'>('withdraw')
  const [showPurchase, setShowPurchase] = useState(false)
  const [showExpense, setShowExpense] = useState(false)
  const [showOwnerCapital, setShowOwnerCapital] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [receipt, setReceipt] = useState<Sale | null>(null)
  const [editingSale, setEditingSale] = useState<Sale | null>(null)
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [editingExpense, setEditingExpense] = useState<BusinessExpense | null>(null)
  const [editingPurchase, setEditingPurchase] = useState<InventoryPurchase | null>(null)
  const [editingPettyCash, setEditingPettyCash] = useState<PettyCash | null>(null)
  const [editingDebtPayment, setEditingDebtPayment] = useState<DebtPayment | null>(null)
  const [search, setSearch] = useState('')
  const [includeVat, setIncludeVat] = useState(true)
  const [cart, setCart] = useState<CartItem[]>([])

  const requestDeleteConfirmation = (message: string) => new Promise<boolean>((resolve) => {
    deleteConfirmationResolver.current = resolve
    setDeleteConfirmation(message)
  })

  const resolveDeleteConfirmation = (confirmed: boolean) => {
    const resolve = deleteConfirmationResolver.current
    deleteConfirmationResolver.current = null
    setDeleteConfirmation(null)
    resolve?.(confirmed)
  }

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
    setPurchases(payload.purchases ?? [])
    setDebtPayments(payload.debtPayments ?? [])
    setAccountBalances(payload.accountBalances ?? { cash: 0, bank: 0, mobile_money: 0, other: 0 })
    setCashMovements(payload.cashMovements ?? [])
    setBusinessExpenses(payload.expenses ?? [])
  }

  useEffect(() => {
    if (loggedIn) {
      void loadData()
    }
  }, [loggedIn])

  const totals = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const recognizedSales = sales.filter((entry) => entry.paymentStatus !== 'payment')
    const todaySales = recognizedSales.filter((entry) => entry.date === today)
    const todayPettyCash = pettyCash.filter((entry) => entry.date === today)
    const todayVat = todaySales.reduce((sum, entry) => sum + getSaleVat(entry), 0)
    const todayRevenue = todaySales.reduce((sum, entry) => sum + getSaleRevenue(entry), 0)
    const todayCost = todaySales.flatMap((entry) => entry.items ?? []).reduce((sum, item) => sum + Number(item.buy ?? 0) * Number(item.qty ?? 0), 0)
    const todayOperatingExpenses = todayPettyCash.filter((entry) => entry.type === 'expense').reduce((sum, entry) => sum + Number(entry.amount) - Number(entry.vatAmount ?? 0), 0)
    const todayOtherIncome = todayPettyCash.filter((entry) => entry.type === 'other_income').reduce((sum, entry) => sum + Number(entry.amount), 0)
    const todayOtherExpenses = todayPettyCash.filter((entry) => entry.type === 'other_expense').reduce((sum, entry) => sum + Number(entry.amount) - Number(entry.vatAmount ?? 0), 0)
    const todayExpenseRecords = businessExpenses.filter((entry) => entry.date === today)
    const pettyCashBalance = pettyCash.reduce((balance, entry) => balance + (['owner_contribution', 'customer_payment', 'cash_in', 'other_income', 'bank_transfer_in', 'cash_transfer_in'].includes(entry.type) ? Number(entry.amount) : -Number(entry.amount)), 0)
    const totalRevenue = recognizedSales.reduce((sum, entry) => sum + getSaleRevenue(entry), 0)
    const totalCogs = recognizedSales.flatMap((entry) => entry.items ?? []).reduce((sum, item) => sum + Number(item.buy ?? 0) * Number(item.qty ?? 0), 0)
    const totalOutputVat = recognizedSales.reduce((sum, entry) => sum + getSaleVat(entry), 0)
    const totalOperatingExpenses = pettyCash.filter((entry) => entry.type === 'expense').reduce((sum, entry) => sum + Number(entry.amount) - Number(entry.vatAmount ?? 0), 0)
      + businessExpenses.reduce((sum, entry) => sum + Number(entry.amountExclVat), 0)
    const totalOtherIncome = pettyCash.filter((entry) => entry.type === 'other_income').reduce((sum, entry) => sum + Number(entry.amount), 0)
    const totalOtherExpenses = pettyCash.filter((entry) => entry.type === 'other_expense').reduce((sum, entry) => sum + Number(entry.amount) - Number(entry.vatAmount ?? 0), 0)
    const totalInputVat = pettyCash.filter((entry) => ['expense', 'other_expense'].includes(entry.type)).reduce((sum, entry) => sum + Number(entry.vatAmount ?? 0), 0)
      + purchases.reduce((sum, purchase) => sum + Number(purchase.vatAmount ?? 0) * Math.min(1, Number(purchase.paidAmount ?? 0) / Math.max(Number(purchase.total ?? 0), 1)), 0)
      + businessExpenses.reduce((sum, entry) => sum + Number(entry.vatAmount) * Math.min(1, Number(entry.paidAmount) / Math.max(Number(entry.total), 1)), 0)
    const totalNetProfit = totalRevenue - totalCogs - totalOperatingExpenses + totalOtherIncome - totalOtherExpenses
    const totalReceivables = debts.filter((entry) => entry.kind === 'customer').reduce((sum, entry) => sum + Number(entry.amount), 0)
    const totalPayables = debts.filter((entry) => entry.kind === 'supplier').reduce((sum, entry) => sum + Number(entry.amount), 0)
    const totalInventory = products.reduce((sum, product) => sum + Number(product.stock) * Number(product.buy), 0)
    const knownAssets = accountBalances.cash + accountBalances.bank + accountBalances.mobile_money + accountBalances.other + pettyCashBalance + totalReceivables + totalInventory + Math.max(0, totalInputVat - totalOutputVat)
    const knownLiabilities = totalPayables + Math.max(0, totalOutputVat - totalInputVat)
    const ownerCapitalContributions = cashMovements.filter((movement) => movement.type === 'owner_capital').reduce((sum, movement) => sum + Number(movement.amount), 0)
    const ownerContributions = pettyCash.filter((entry) => entry.type === 'owner_contribution').reduce((sum, entry) => sum + Number(entry.amount), 0) + ownerCapitalContributions
    const knownEquity = ownerContributions + totalNetProfit - pettyCash.filter((entry) => entry.type === 'owner_drawing').reduce((sum, entry) => sum + Number(entry.amount), 0)

    return {
      sales: totalRevenue,
      profit: recognizedSales.reduce((sum, entry) => sum + Number(entry.profit), 0),
      todaySales: todayRevenue,
      todaySaleCount: todaySales.length,
      todayGrossProfit: todayRevenue - todayCost,
      todayNetProfit: todayRevenue - todayCost - todayOperatingExpenses - todayExpenseRecords.reduce((sum, entry) => sum + Number(entry.amountExclVat), 0) + todayOtherIncome - todayOtherExpenses,
      todayVat,
      owed: debts.filter((entry) => entry.kind === 'customer').reduce((sum, entry) => sum + Number(entry.amount), 0),
      owe: debts.filter((entry) => entry.kind === 'supplier').reduce((sum, entry) => sum + Number(entry.amount), 0),
      inventory: products.reduce((sum, product) => sum + Number(product.stock) * Number(product.buy), 0),
      pettyCashBalance,
      ownerDrawings: pettyCash.filter((entry) => entry.type === 'owner_drawing').reduce((sum, entry) => sum + Number(entry.amount), 0),
      ownerContributions,
      ownerCapitalCount: pettyCash.filter((entry) => entry.type === 'owner_contribution').length + cashMovements.filter((movement) => movement.type === 'owner_capital').length,
      cash: accountBalances.cash,
      bank: accountBalances.bank,
      mobileMoney: accountBalances.mobile_money,
      otherAccounts: accountBalances.other,
      outputVat: totalOutputVat,
      inputVat: totalInputVat,
      vatPayable: Math.max(0, totalOutputVat - totalInputVat),
      vatCredit: Math.max(0, totalInputVat - totalOutputVat),
      totalAssets: knownAssets,
      totalLiabilities: knownLiabilities,
      knownEquity,
      balanceDifference: knownAssets - knownLiabilities - knownEquity,
    }
  }, [sales, debts, pettyCash, products, purchases, accountBalances, businessExpenses, cashMovements])

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
      body: JSON.stringify({ ...salePayload, user: username }),
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
        user: username,
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
    await loadData()
    setCart([])
    setShowSale(false)
  }

  const deleteSale = async (sale: Sale) => {
    const prompt = sale.creditDebtId
      ? `Delete credit sale ${sale.id}? This is only possible before any customer payment has been recorded.`
      : `Delete sale ${sale.id}? Its items will be returned to stock.`
    if (!(await requestDeleteConfirmation(prompt))) return
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
    if (payload.deletedCreditSale) {
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

  const settleDebt = async (debt: Debt, amount: number, paymentMethod: string) => {
    const response = await fetch(`/api/debts/${debt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, paymentMethod, user: username }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? 'Unable to record payment.')
    }
    await loadData()
    setPayingDebt(null)
  }

  const updateDebtPayment = async (payment: DebtPayment, input: { amount: number; paymentMethod: string; date: string }) => {
    const response = await fetch(`/api/debt-payments/${encodeURIComponent(payment.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, user: username }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Unable to update payment.')
    await loadData()
    setEditingDebtPayment(null)
  }

  const deleteDebt = async (debt: Debt) => {
    if (!(await requestDeleteConfirmation(`Delete ${debt.name} from the debt ledger? This cannot be undone.`))) return
    const response = await fetch(`/api/debts/${debt.id}`, { method: 'DELETE' })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      setLoginError(payload.error ?? 'Unable to delete debt record.')
      return
    }
    setDebts((current) => current.filter((entry) => entry.id !== debt.id))
  }

  const createProduct = async (input: ProductFormInput) => {
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, user: username }),
    })

    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? 'Unable to create product.')
    }

    await loadData()
    return payload.product as Product
  }

  const updateProduct = async (id: number, input: Omit<Product, 'id'>) => {
    const response = await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, user: username }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? 'Unable to update product.')
    }
    setProducts((current) => current.map((product) => product.id === id ? payload.product : product))
    setEditingProduct(null)
  }

  const deleteProduct = async (product: Product) => {
    if (!(await requestDeleteConfirmation(`Delete ${product.name}? This cannot be undone.`))) {
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

  const updateDebt = async (id: number, input: { name: string; phone?: string; amount?: number; kind: 'customer' | 'supplier'; due: string; description?: string }) => {
    const response = await fetch(`/api/debts/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        phone: input.phone ?? '',
        amount: input.amount,
        kind: input.kind,
        due: input.due,
        description: input.description,
      }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? 'Unable to update debt record.')
    }
    await loadData()
    setEditingDebt(null)
  }

  const createPettyCash = async (input: { amount: number; reason: string; date: string; type: PettyCash['type']; category: string; vatAmount: number; paymentMethod: string }) => {
    const response = await fetch('/api/petty-cash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, user: username }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? 'Unable to save petty cash record.')
    }
    await loadData()
  }

  const createOwnerCapital = async (input: { amount: number; date: string }) => {
    const response = await fetch('/api/owner-capital', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, user: username }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Unable to add owner capital.')
    await loadData()
    setShowOwnerCapital(false)
  }

  const updatePettyCash = async (entry: PettyCash, input: { amount: number; reason: string; date: string; category: string; vatAmount: number }) => {
    const response = await fetch(`/api/petty-cash/${encodeURIComponent(entry.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Unable to update petty-cash transaction.')
    await loadData()
    setEditingPettyCash(null)
  }

  const deletePettyCash = async (entry: PettyCash) => {
    if (!(await requestDeleteConfirmation(`Delete petty-cash transaction "${entry.reason}"? Related balances will be reversed.`))) return
    const response = await fetch(`/api/petty-cash/${encodeURIComponent(entry.id)}`, { method: 'DELETE' })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      setLoginError(payload.error ?? 'Unable to delete petty-cash transaction.')
      return
    }
    await loadData()
  }

  const createInventoryPurchase = async (input: { supplier: string; date: string; items: { productId: number; qty: number; unitCost: number }[]; vatAmount: number; paidAmount: number; paymentMethod: string }) => {
    const response = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, user: username }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Unable to record inventory purchase.')
    await loadData()
    setShowPurchase(false)
  }

  const updateInventoryPurchase = async (id: string, input: { supplier: string; date: string; items: { productId: number; qty: number; unitCost: number }[]; vatAmount: number; paidAmount: number; paymentMethod: string }) => {
    const response = await fetch(`/api/purchases/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, user: username }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Unable to update inventory purchase.')
    await loadData()
    setEditingPurchase(null)
  }

  const deleteInventoryPurchase = async (purchase: InventoryPurchase) => {
    if (!(await requestDeleteConfirmation(`Delete inventory purchase ${purchase.id}? Stock and the associated payable/payment will be reversed.`))) return
    const response = await fetch(`/api/purchases/${encodeURIComponent(purchase.id)}`, { method: 'DELETE' })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      setLoginError(payload.error ?? 'Unable to delete inventory purchase.')
      return
    }
    await loadData()
  }

  const createBusinessExpense = async (input: { date: string; category: string; description: string; supplier: string; amountExclVat: number; vatAmount: number; paymentStatus: 'paid' | 'unpaid'; paymentMethod: string }) => {
    const response = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, user: username }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Unable to record business expense.')
    await loadData()
    setShowExpense(false)
  }

  const updateBusinessExpense = async (id: string, input: { date: string; category: string; description: string; supplier: string; amountExclVat: number; vatAmount: number; paymentStatus: 'paid' | 'unpaid'; paymentMethod: string }) => {
    const response = await fetch(`/api/expenses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const payload = await response.json()
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Unable to update business expense.')
    await loadData()
    setEditingExpense(null)
  }

  const deleteBusinessExpense = async (expense: BusinessExpense) => {
    if (!(await requestDeleteConfirmation(`Delete expense "${expense.description}"? Its recorded balances will be reversed.`))) return
    const response = await fetch(`/api/expenses/${encodeURIComponent(expense.id)}`, { method: 'DELETE' })
    const payload = await response.json()
    if (!response.ok || !payload.ok) {
      setLoginError(payload.error ?? 'Unable to delete business expense.')
      return
    }
    await loadData()
  }

  const handleLogout = () => {
    setLoggedIn(false)
    setProducts([])
    setSales([])
    setDebts([])
    setPettyCash([])
    setPurchases([])
    setDebtPayments([])
    setAccountBalances({ cash: 0, bank: 0, mobile_money: 0, other: 0 })
    setCashMovements([])
    setBusinessExpenses([])
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
          {page === 'Finances' && <FinancePage debts={debts} pettyCash={pettyCash} cashMovements={cashMovements} ownerContributions={totals.ownerContributions} purchases={purchases} expenses={businessExpenses} accountBalances={accountBalances} onEditPettyCash={setEditingPettyCash} onDeletePettyCash={deletePettyCash} onEditPurchase={setEditingPurchase} onDeletePurchase={deleteInventoryPurchase} onEditExpense={setEditingExpense} onDeleteExpense={deleteBusinessExpense} setShowDebt={setShowDebt} setShowPurchase={() => setShowPurchase(true)} setShowExpense={() => setShowExpense(true)} onAddOwnerCapital={() => setShowOwnerCapital(true)} onReceivePettyCash={() => { setPettyCashAction('receive'); setShowPettyCash(true) }} onWithdrawPettyCash={() => { setPettyCashAction('withdraw'); setShowPettyCash(true) }} onRecordDrawing={() => { setPettyCashAction('drawing'); setShowPettyCash(true) }} onPayDebt={setPayingDebt} onEditDebt={setEditingDebt} onDeleteDebt={deleteDebt} />}
          {page === 'Reports' && <Reports products={products} sales={sales} pettyCash={pettyCash} cashMovements={cashMovements} purchases={purchases} expenses={businessExpenses} totals={totals} />}
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

      {editingDebt && (
        <DebtModal
          debt={editingDebt}
          close={() => setEditingDebt(null)}
          onSave={async (payload) => {
            try {
              await updateDebt(editingDebt.id, payload)
            } catch (error) {
              setLoginError(error instanceof Error ? error.message : 'Unable to update debt.')
            }
          }}
        />
      )}

      {showPettyCash && (
        <PettyCashModal
          action={pettyCashAction}
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

      {showOwnerCapital && <OwnerCapitalModal close={() => setShowOwnerCapital(false)} onSave={createOwnerCapital} />}

      {showPurchase && (
        <InventoryPurchaseModal
          products={products}
          close={() => setShowPurchase(false)}
          onCreateProduct={createProduct}
          onSave={async (payload) => {
            try {
              await createInventoryPurchase(payload)
            } catch (error) {
              setLoginError(error instanceof Error ? error.message : 'Unable to record inventory purchase.')
            }
          }}
        />
      )}
      {editingPurchase && <InventoryPurchaseModal purchase={editingPurchase} products={products} close={() => setEditingPurchase(null)} onCreateProduct={createProduct} onSave={(payload) => updateInventoryPurchase(editingPurchase.id, payload)} onDelete={() => void deleteInventoryPurchase(editingPurchase)} />}

      {showExpense && (
        <BusinessExpenseModal
          close={() => setShowExpense(false)}
          onSave={async (payload) => {
            try {
              await createBusinessExpense(payload)
            } catch (error) {
              setLoginError(error instanceof Error ? error.message : 'Unable to record business expense.')
            }
          }}
        />
      )}
      {editingExpense && <BusinessExpenseModal expense={editingExpense} close={() => setEditingExpense(null)} onDelete={() => void deleteBusinessExpense(editingExpense)} onSave={(payload) => updateBusinessExpense(editingExpense.id, payload)} />}
      {editingPettyCash && <PettyCashEditModal entry={editingPettyCash} close={() => setEditingPettyCash(null)} onDelete={() => void deletePettyCash(editingPettyCash)} onSave={(payload) => updatePettyCash(editingPettyCash, payload)} />}
      {editingDebtPayment && <DebtPaymentEditModal payment={editingDebtPayment} close={() => setEditingDebtPayment(null)} onSave={(payload) => updateDebtPayment(editingDebtPayment, payload)} />}
      {receipt && <ReceiptModal sale={receipt} close={() => setReceipt(null)} />}
      {editingSale && <SaleEditModal sale={editingSale} products={products} close={() => setEditingSale(null)} onSave={(items, date, vat) => updateSale(editingSale, items, date, vat)} />}
      {payingDebt && <DebtPaymentModal debt={payingDebt} close={() => setPayingDebt(null)} onPay={(amount, method) => settleDebt(payingDebt, amount, method)} />}
      {deleteConfirmation && <DeleteConfirmationModal message={deleteConfirmation} onCancel={() => resolveDeleteConfirmation(false)} onConfirm={() => resolveDeleteConfirmation(true)} />}
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
        .filter((entry: Sale) => entry.date === date && entry.paymentStatus !== 'payment')
        .reduce((sum: number, entry: Sale) => sum + getSaleRevenue(entry), 0)

      return {
        date,
        label: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        value: revenue,
      }
    })
  }, [sales])

  const categoryRevenue = useMemo(() => {
    const totalsByCategory = new Map<string, number>()

    for (const entry of sales.filter((sale: Sale) => sale.paymentStatus !== 'payment')) {
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
    { label: "Today's sales (excl. VAT)", value: money(totals.todaySales || 0), color: 'teal', icon: ShoppingCart, change: `${totals.todaySaleCount} sale${totals.todaySaleCount === 1 ? '' : 's'} today` },
    { label: "Today's gross profit", value: money(totals.todayGrossProfit || 0), color: 'teal', icon: TrendingUp, change: 'Before petty cash' },
    { label: "Today's net profit", value: money(totals.todayNetProfit || 0), color: 'green', icon: TrendingUp, change: 'After petty cash' },
    { label: 'Output VAT collected', value: money(totals.todayVat || 0), color: 'amber', icon: CircleDollarSign, change: 'Input VAT tracked separately' },
    { label: 'Customers owe', value: money(totals.owed), color: 'amber', icon: Users, change: 'Open customer debts' },
    { label: 'Suppliers owed', value: money(totals.owe), color: 'amber', icon: Wallet, change: 'Open supplier balances' },
    { label: 'Cash balance', value: money(totals.cash), color: 'green', icon: Wallet, change: 'From recorded movements' },
    { label: 'Bank balance', value: money(totals.bank), color: 'teal', icon: CircleDollarSign, change: 'From recorded movements' },
    { label: 'Petty cash balance', value: money(totals.pettyCashBalance), color: 'green', icon: Wallet, change: 'Tracked cash movements' },
    { label: "Owner's capital", value: money(totals.ownerContributions), color: 'teal', icon: CircleDollarSign, change: `${totals.ownerCapitalCount} contribution${totals.ownerCapitalCount === 1 ? '' : 's'} recorded` },
    { label: 'Owner drawings', value: money(totals.ownerDrawings), color: 'amber', icon: Users, change: 'Excluded from net profit' },
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
  alwaysVisible = false,
}: {
  count: number
  query: string
  onQueryChange: (value: string) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  placeholder: string
  alwaysVisible?: boolean
}) {
  if (count <= 3 && !alwaysVisible) return null

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
      {count > 3 && <div className="list-scroll-buttons">
        <button type="button" aria-label="Scroll list up" title="Scroll up" onClick={() => scroll(-1)}><ChevronUp /></button>
        <button type="button" aria-label="Scroll list down" title="Scroll down" onClick={() => scroll(1)}><ChevronDown /></button>
      </div>}
    </div>
  )
}

function SalesPage({ sales, products, setShowSale, setReceipt, setEditingSale, deleteSale, search, setSearch }: any) {
  const searchTerm = search.trim().toLowerCase()
  const getItemName = (item: Sale['items'][number]) => {
    const storedName = item.name?.trim()
    if (storedName) return storedName
    const productId = Number(item.productId)
    return products.find((product: Product) => product.id === productId)?.name
      ?? (Number.isFinite(productId) ? `Product #${productId}` : 'Unnamed item')
  }
  const visibleSales = sales.filter((entry: Sale) =>
    entry.id.toLowerCase().includes(searchTerm)
    || entry.items.some((item) => getItemName(item).toLowerCase().includes(searchTerm)),
  )

  return (
    <>
      <Header title="Sales history" subtitle="Review transactions, revenue and profit from your shop." action="New sale" onAction={() => setShowSale(true)} />
      <div className="toolbar">
        <div className="search-box sales-search-box">
          <Search />
          <input aria-label="Search sales by receipt or item" placeholder="Search receipts or items..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select>
          <option>All dates</option>
          <option>This week</option>
        </select>
      </div>

      <div className="panel table-panel sales-history-panel">
        <div className={`sales-history-scroll${visibleSales.length > 4 ? ' is-scrollable' : ''}`}>
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
                <td>
                  <ul className="sale-item-list">
                    {entry.items.map((item, index) => (
                      <li key={`${item.productId ?? item.name}-${index}`}>
                        <span>{getItemName(item)}</span>
                        <small>{formatQuantity(item.qty, item.unit)}</small>
                      </li>
                    ))}
                  </ul>
                </td>
                <td>
                  <strong>{money(entry.total)}</strong>
                </td>
                <td className="green-text">+{money(entry.profit)}</td>
                <td><span className="badge success"><Check />{entry.paymentStatus === 'payment' ? 'Legacy payment' : entry.creditDebtId ? entry.paymentStatus === 'paid' ? 'Credit paid' : entry.paymentStatus === 'partial' ? 'Part paid' : 'Credit sale' : 'Cash'}</span></td>
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
        <div className="document-grid" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div><span>Total sales</span><strong>{money(visibleSales.reduce((sum: number, entry: Sale) => sum + Number(entry.total ?? 0), 0))}</strong></div>
        </div>
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

      <div className="inventory-scroll">
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
      </div>
    </>
  )
}

function DebtPaymentModal({ debt, close, onPay }: { debt: Debt; close: () => void; onPay: (amount: number, method: string) => Promise<void> }) {
  const [amount, setAmount] = useState(String(debt.amount))
  const [paymentMethod, setPaymentMethod] = useState('cash')
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
      await onPay(payment, paymentMethod)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to record payment.')
      setSaving(false)
    }
  }

  return (
    <Modal title={`${debt.kind === 'customer' ? 'Receive payment from' : 'Pay supplier'} ${debt.name}`} close={close}>
      <div className="payment-balance">
        <span>Outstanding debt</span><strong>{money(debt.amount)}</strong>
        {Number(debt.paidAmount ?? 0) > 0 && <small>Previously paid: {money(debt.paidAmount ?? 0)}</small>}
      </div>
      <div className="form-grid">
        <label>Amount being paid<input type="number" min="1" max={debt.amount} step="1" autoFocus value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="petty_cash">Petty cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile Money</option><option value="other">Other</option></select></label>
      </div>
      <div className="payment-remaining"><span>Balance remaining after payment</span><strong>{money(remaining)}</strong></div>
      {error ? <div className="error-text">{error}</div> : null}
      <button className="primary-btn full" disabled={saving || !Number.isFinite(payment) || payment <= 0 || payment > debt.amount} onClick={() => void submit()}>{saving ? 'Recording payment…' : `Record ${money(payment || 0)} payment`} <Check /></button>
    </Modal>
  )
}

function DebtPaymentEditModal({ payment, close, onSave }: { payment: DebtPayment; close: () => void; onSave: (input: { amount: number; paymentMethod: string; date: string }) => Promise<void> }) {
  const [amount, setAmount] = useState(String(payment.amount))
  const [date, setDate] = useState(payment.date)
  const [paymentMethod, setPaymentMethod] = useState(payment.paymentMethod)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave({ amount: Number(amount), paymentMethod, date })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update payment.')
      setSaving(false)
    }
  }

  return (
    <Modal title={`Edit ${payment.kind} payment`} close={close}>
      <div className="form-grid">
        <label>Payment date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Amount<input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label>Payment account<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="petty_cash">Petty cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile Money</option><option value="other">Other</option></select></label>
      </div>
      {error ? <div className="error-text">{error}</div> : null}
      <button className="primary-btn full" disabled={saving || Number(amount) <= 0} onClick={() => void save()}>{saving ? 'Saving payment…' : 'Save payment changes'} <Check /></button>
    </Modal>
  )
}

function FinancePage({ debts, pettyCash, cashMovements, ownerContributions, purchases, expenses, accountBalances, onEditPettyCash, onDeletePettyCash, onEditPurchase, onDeletePurchase, onEditExpense, onDeleteExpense, setShowDebt, setShowPurchase, setShowExpense, onAddOwnerCapital, onReceivePettyCash, onWithdrawPettyCash, onRecordDrawing, onPayDebt, onEditDebt, onDeleteDebt }: any) {
  const customers = debts.filter((item: Debt) => item.kind === 'customer')
  const suppliers = debts.filter((item: Debt) => item.kind === 'supplier')
  const [customerSearch, setCustomerSearch] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [pettyCashSearch, setPettyCashSearch] = useState('')
  const [drawingSearch, setDrawingSearch] = useState('')
  const [expenseSearch, setExpenseSearch] = useState('')
  const [purchaseSearch, setPurchaseSearch] = useState('')
  const [ownerCapitalSearch, setOwnerCapitalSearch] = useState('')
  const customerListRef = useRef<HTMLDivElement>(null)
  const supplierListRef = useRef<HTMLDivElement>(null)
  const pettyCashListRef = useRef<HTMLDivElement>(null)
  const drawingListRef = useRef<HTMLDivElement>(null)
  const expenseListRef = useRef<HTMLDivElement>(null)
  const purchaseListRef = useRef<HTMLDivElement>(null)
  const ownerCapitalListRef = useRef<HTMLDivElement>(null)
  const visibleCustomers = customers.filter((entry: Debt) => `${entry.name} ${entry.phone ?? ''} ${entry.description ?? ''}`.toLowerCase().includes(customerSearch.toLowerCase()))
  const visibleSuppliers = suppliers.filter((entry: Debt) => `${entry.name} ${entry.phone ?? ''} ${entry.description ?? ''}`.toLowerCase().includes(supplierSearch.toLowerCase()))
  const ownerDrawings = pettyCash.filter((entry: PettyCash) => entry.type === 'owner_drawing')
  const pettyCashEntries = pettyCash.filter((entry: PettyCash) => entry.type !== 'owner_drawing')
  const visiblePettyCash = pettyCashEntries.filter((entry: PettyCash) => `${entry.reason} ${entry.category ?? ''} ${entry.type} ${entry.date} ${entry.amount}`.toLowerCase().includes(pettyCashSearch.trim().toLowerCase()))
  const visibleDrawings = ownerDrawings.filter((entry: PettyCash) => `${entry.reason} ${entry.category ?? ''} ${entry.date} ${entry.amount}`.toLowerCase().includes(drawingSearch.trim().toLowerCase()))
  const visibleExpenses = expenses.filter((entry: BusinessExpense) => `${entry.category} ${entry.description} ${entry.supplier} ${entry.date} ${entry.paymentStatus}`.toLowerCase().includes(expenseSearch.trim().toLowerCase()))
  const visiblePurchases = purchases.filter((entry: InventoryPurchase) => `${entry.supplier} ${entry.id} ${entry.date} ${entry.items.map((item) => item.name).join(' ')} ${entry.paymentMethod}`.toLowerCase().includes(purchaseSearch.trim().toLowerCase()))
  const ownerCapitalEntries = [
    ...cashMovements.filter((movement: { type: string }) => movement.type === 'owner_capital').map((movement: { id: string; date: string; amount: number; reference?: string; user?: string }) => ({
      id: `cash-${movement.id}`,
      date: movement.date,
      amount: Number(movement.amount),
      source: 'Main cash',
      reference: movement.reference ?? "Owner's capital",
      user: movement.user ?? 'unknown',
    })),
    ...pettyCash.filter((entry: PettyCash) => entry.type === 'owner_contribution').map((entry: PettyCash) => ({
      id: `petty-${entry.id}`,
      date: entry.date,
      amount: Number(entry.amount),
      source: 'Petty cash',
      reference: entry.reason,
      user: entry.user ?? 'unknown',
    })),
  ].sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))
  const visibleOwnerCapitalEntries = ownerCapitalEntries.filter((entry) =>
    `${entry.date} ${entry.amount} ${entry.source} ${entry.reference} ${entry.user}`.toLowerCase().includes(ownerCapitalSearch.trim().toLowerCase()),
  )
  const pettyCashInflows = pettyCash.filter((entry: PettyCash) => ['owner_contribution', 'customer_payment', 'cash_in', 'other_income', 'bank_transfer_in', 'cash_transfer_in'].includes(entry.type)).reduce((sum: number, entry: PettyCash) => sum + Number(entry.amount), 0)
  const pettyCashOutflows = pettyCashEntries.filter((entry: PettyCash) => !['owner_contribution', 'customer_payment', 'cash_in', 'other_income', 'bank_transfer_in', 'cash_transfer_in'].includes(entry.type)).reduce((sum: number, entry: PettyCash) => sum + Number(entry.amount), 0)
  const ownerDrawingTotal = ownerDrawings.reduce((sum: number, entry: PettyCash) => sum + Number(entry.amount), 0)
  const pettyCashAvailable = pettyCashInflows - pettyCashOutflows - ownerDrawingTotal

  return (
    <>
      <Header title="Finances" subtitle="Keep track of money owed to you, payments you need to make, and cash withdrawn for shop expenses." action="Add owner's capital" onAction={onAddOwnerCapital} />
      <div className="finance-actions">
        <button className="outline-btn" onClick={() => setShowDebt(true)}><Plus /> Add debt</button>
        <button className="outline-btn" onClick={() => setShowExpense(true)}><Plus /> Record expense</button>
        <button className="outline-btn" onClick={onRecordDrawing}><Users /> Add drawing</button>
        <button className="primary-btn compact" onClick={() => setShowPurchase(true)}><Package /> Receive inventory</button>
      </div>
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
        <div><span>Cash / bank</span><strong>{money(accountBalances.cash + accountBalances.bank)}</strong><small>Excludes petty cash and mobile money</small></div>
        <div><span>Owner&apos;s capital</span><strong>{money(ownerContributions)}</strong><small>{ownerCapitalEntries.length} contribution{ownerCapitalEntries.length === 1 ? '' : 's'} recorded</small></div>
      </div>

      <div className="panel owner-capital-panel">
        <div className="panel-head">
          <div className="petty-cash-title">
            <span className="owner-capital-mark"><CircleDollarSign /></span>
            <div><h2>Owner&apos;s capital</h2><p>Capital contributions recorded for the business</p></div>
          </div>
          <span className="petty-cash-count">{ownerCapitalEntries.length} {ownerCapitalEntries.length === 1 ? 'contribution' : 'contributions'}</span>
        </div>
        <div className="petty-cash-summary owner-capital-total">
          <div><span>Total contributed</span><strong>{money(ownerContributions)}</strong></div>
          <small>Each entry is effective from 12:00 AM on its recorded date.</small>
        </div>
        <BrowseControls count={ownerCapitalEntries.length} query={ownerCapitalSearch} onQueryChange={setOwnerCapitalSearch} scrollRef={ownerCapitalListRef} placeholder="Search owner capital..." alwaysVisible />
        <div className={`owner-capital-list ${ownerCapitalEntries.length > 3 ? 'side-scroll-list' : ''}`} ref={ownerCapitalListRef}>
          {visibleOwnerCapitalEntries.length ? visibleOwnerCapitalEntries.map((entry) => (
            <div className="owner-capital-row" key={entry.id}>
              <span className="owner-capital-entry-icon"><CircleDollarSign /></span>
              <span className="expense-description">
                <strong>{money(entry.amount)} added</strong>
                <small>{new Date(`${entry.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {entry.source} · {entry.user} · {entry.reference}</small>
              </span>
              <span className="owner-capital-entry-date">{entry.date}</span>
            </div>
          )) : <div className="owner-capital-empty">{ownerCapitalEntries.length ? 'No matching capital contributions.' : 'No owner capital recorded yet.'}</div>}
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
            <DebtRow key={entry.id} entry={entry} onPayDebt={onPayDebt} onEditDebt={onEditDebt} onDeleteDebt={onDeleteDebt} />
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
            <DebtRow key={entry.id} entry={entry} onPayDebt={onPayDebt} onEditDebt={onEditDebt} onDeleteDebt={onDeleteDebt} />
          )) : <div className="empty-state">{suppliers.length ? 'No matching suppliers.' : 'No supplier debts recorded.'}</div>}
          </div>
        </div>
      </div>

      <div className="panel business-expense-history">
        <div className="panel-head"><div><h2>Business expenses</h2><p>Recognized on the expense date; unpaid balances remain in supplier payables.</p></div><span className="count-badge amber-bg">{visibleExpenses.length} / {expenses.length}</span></div>
        <BrowseControls count={expenses.length} query={expenseSearch} onQueryChange={setExpenseSearch} scrollRef={expenseListRef} placeholder="Search expenses..." alwaysVisible />
        {visibleExpenses.length ? <div className={`business-expense-list${visibleExpenses.length > 3 ? ' is-scrollable' : ''}`} ref={expenseListRef}>
          {visibleExpenses.map((expense: BusinessExpense) => <div className="business-expense-row" key={expense.id}>
            <span><strong>{expense.category} · {expense.description}</strong><small>{expense.date}{expense.supplier ? ` · ${expense.supplier}` : ''} · {expense.paymentStatus === 'paid' ? 'Paid' : expense.paymentStatus === 'partial' ? 'Partially paid' : 'Unpaid'}</small></span>
            <strong>{money(expense.amountExclVat)}<small>VAT {money(expense.vatAmount)} · Total {money(expense.total)}</small></strong>
            <span className="transaction-row-actions"><button className="icon-btn" type="button" title="Edit expense" aria-label={`Edit expense ${expense.description}`} onClick={() => onEditExpense(expense)}><Pencil /></button><button className="icon-btn danger-icon" type="button" title="Delete expense" aria-label={`Delete expense ${expense.description}`} onClick={() => void onDeleteExpense(expense)}><Trash2 /></button></span>
          </div>)}
        </div> : <div className="empty-state">{expenses.length ? 'No matching expenses.' : 'No business expenses recorded.'}</div>}
      </div>

      <div className="panel inventory-purchase-history">
        <div className="panel-head">
          <div><h2>Inventory purchases</h2><p>Purchases increase stock; only items sold enter COGS.</p></div>
          <span className="count-badge teal-bg">{visiblePurchases.length} / {purchases.length}</span>
        </div>
        <BrowseControls count={purchases.length} query={purchaseSearch} onQueryChange={setPurchaseSearch} scrollRef={purchaseListRef} placeholder="Search supplier, product or reference..." alwaysVisible />
        {visiblePurchases.length ? <div className={`purchase-history-list${visiblePurchases.length > 3 ? ' is-scrollable' : ''}`} ref={purchaseListRef}>
          {visiblePurchases.map((purchase: InventoryPurchase) => {
            const inventoryCost = purchase.items.reduce((sum, item) => sum + Number(item.qty) * Number(item.unitCost), 0)
            return <div className="purchase-history-row" key={purchase.id}>
              <div><strong>{purchase.supplier}</strong><small>{purchase.id} · {purchase.date} · {purchase.items.map((item) => `${item.name} (${formatQuantity(item.qty, item.unit)})`).join(', ')}</small></div>
              <span>Inventory {money(inventoryCost)}<small>VAT {money(purchase.vatAmount)}</small></span>
              <span>Paid {money(purchase.paidAmount)}<small>Owing {money(Math.max(0, purchase.total - purchase.paidAmount))}</small></span>
              <span className="transaction-row-actions">
                <button className="icon-btn" type="button" title="Edit inventory purchase" aria-label={`Edit purchase ${purchase.id}`} onClick={() => onEditPurchase(purchase)}>
                  <Pencil />
                </button>
                <button className="icon-btn danger-icon" type="button" title="Delete inventory purchase" aria-label={`Delete purchase ${purchase.id}`} onClick={() => void onDeletePurchase(purchase)}>
                  <Trash2 />
                </button>
              </span>
            </div>
          })}
        </div> : <div className="empty-state">{purchases.length ? 'No matching purchases.' : 'No inventory purchases recorded.'}</div>}
      </div>

      <div className="panel petty-cash-panel">
        <div className="panel-head">
          <div className="petty-cash-title">
            <span className="petty-cash-mark"><Wallet /></span>
            <div>
              <h2>Petty cash</h2>
              <p>Cash receipts and business spending</p>
            </div>
          </div>
          <div className="petty-cash-actions">
            <button className="outline-btn" onClick={onWithdrawPettyCash}><Wallet /> Withdraw from Petty Cash</button>
            <button className="primary-btn compact" onClick={onReceivePettyCash}><Plus /> Add Money to Petty Cash</button>
          </div>
        </div>
        <div className="petty-cash-summary">
          <div><span>Available balance</span><strong>{money(pettyCashAvailable)}</strong></div>
          <div><span>Total added</span><strong className="cash-in-amount">+{money(pettyCashInflows)}</strong></div>
          <div><span>Total used</span><strong className="negative">−{money(pettyCashOutflows)}</strong></div>
          <span className="petty-cash-count">{pettyCashEntries.length} {pettyCashEntries.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        <BrowseControls count={pettyCashEntries.length} query={pettyCashSearch} onQueryChange={setPettyCashSearch} scrollRef={pettyCashListRef} placeholder="Search petty cash..." alwaysVisible />
        <div className={`petty-cash-ledger ${pettyCashEntries.length > 3 ? 'side-scroll-list' : ''}`} ref={pettyCashListRef}>
          {visiblePettyCash.length ? visiblePettyCash.map((entry: PettyCash) => (
            <div className="petty-cash-entry" key={entry.id}>
              <span className="expense-indicator"><Wallet /></span>
              <span className="expense-description"><strong>{entry.reason}</strong><small>{entry.category || (entry.type === 'expense' ? 'Business expense' : entry.type === 'business_expense_payment' ? 'Business expense payment' : entry.type === 'other_expense' ? 'Other business expense' : entry.type === 'other_income' ? 'Other business income' : entry.type === 'owner_drawing' ? 'Owner drawing' : entry.type === 'owner_contribution' ? 'Owner capital contribution' : entry.type === 'bank_transfer_in' ? 'Transfer from bank' : entry.type === 'cash_transfer_in' ? 'Transfer from main cash' : entry.type === 'customer_payment' ? 'Customer payment' : entry.type === 'supplier_payment' ? 'Supplier payment' : entry.type === 'inventory_purchase_payment' ? 'Inventory purchase payment' : 'Cash transfer')} · {new Date(`${entry.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · Balance {money(entry.runningBalance ?? 0)} · {entry.user ?? 'unknown'} · Ref {entry.reference || entry.id}</small></span>
              <strong className={`expense-amount ${['owner_contribution', 'customer_payment', 'cash_in', 'other_income', 'bank_transfer_in', 'cash_transfer_in'].includes(entry.type) ? 'cash-in-amount' : ''}`}>{['owner_contribution', 'customer_payment', 'cash_in', 'other_income', 'bank_transfer_in', 'cash_transfer_in'].includes(entry.type) ? '+' : '−'}{money(entry.amount)}</strong>
              <span className="transaction-row-actions"><button className="icon-btn" type="button" title="Edit petty-cash transaction" aria-label={`Edit petty-cash transaction ${entry.reason}`} onClick={() => onEditPettyCash(entry)}><Pencil /></button><button className="icon-btn danger-icon" type="button" title="Delete petty-cash transaction" aria-label={`Delete petty-cash transaction ${entry.reason}`} onClick={() => void onDeletePettyCash(entry)}><Trash2 /></button></span>
            </div>
          )) : pettyCashEntries.length ? <div className="empty-state">No matching petty-cash entries.</div> : <div className="petty-cash-empty"><Wallet /><span>No petty-cash activity yet</span><small>Cash receipts and business spending will appear here.</small></div>}
        </div>
      </div>

      <div className="panel owner-drawings-panel">
        <div className="panel-head">
          <div className="petty-cash-title">
            <span className="petty-cash-mark"><Users /></span>
            <div><h2>Owner drawings</h2><p>Personal withdrawals, listed separately from petty-cash activity</p></div>
          </div>
          <span className="owner-drawings-actions">
            <button className="primary-btn compact" type="button" onClick={onRecordDrawing}><Plus /> Add drawing</button>
            <span className="petty-cash-count">{ownerDrawings.length} {ownerDrawings.length === 1 ? 'drawing' : 'drawings'}</span>
          </span>
        </div>
        <div className="petty-cash-summary">
          <div><span>Total drawings</span><strong className="negative">−{money(ownerDrawingTotal)}</strong></div>
        </div>
        <BrowseControls count={ownerDrawings.length} query={drawingSearch} onQueryChange={setDrawingSearch} scrollRef={drawingListRef} placeholder="Search owner drawings..." alwaysVisible />
        <div className={`owner-drawings-ledger ${ownerDrawings.length > 3 ? 'side-scroll-list' : ''}`} ref={drawingListRef}>
          {visibleDrawings.length ? visibleDrawings.map((entry: PettyCash) => (
            <div className="petty-cash-entry" key={entry.id}>
              <span className="expense-indicator"><Users /></span>
              <span className="expense-description"><strong>{entry.reason}</strong><small>{entry.category || 'Owner drawing'} · {new Date(`${entry.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {entry.user ?? 'unknown'} · Ref {entry.reference || entry.id}</small></span>
              <strong className="expense-amount">−{money(entry.amount)}</strong>
              <span className="transaction-row-actions"><button className="icon-btn" type="button" title="Edit owner drawing" aria-label={`Edit owner drawing ${entry.reason}`} onClick={() => onEditPettyCash(entry)}><Pencil /></button><button className="icon-btn danger-icon" type="button" title="Delete owner drawing" aria-label={`Delete owner drawing ${entry.reason}`} onClick={() => void onDeletePettyCash(entry)}><Trash2 /></button></span>
            </div>
          )) : ownerDrawings.length ? <div className="empty-state">No matching owner drawings.</div> : <div className="petty-cash-empty"><Users /><span>No owner drawings recorded</span><small>Use the Owner drawing button above to record a personal withdrawal.</small></div>}
        </div>
      </div>
    </>
  )
}

function DebtRow({ entry, onPayDebt, onEditDebt, onDeleteDebt }: { entry: Debt; onPayDebt: (entry: Debt) => void; onEditDebt?: (entry: Debt) => void; onDeleteDebt?: (entry: Debt) => void }) {
  const paidAmount = Math.max(0, Number(entry.paidAmount ?? 0))
  const remainingAmount = Math.max(0, Number(entry.amount ?? 0))
  const originalAmount = Math.max(Number(entry.original ?? 0), paidAmount + remainingAmount, 1)
  const isCustomer = entry.kind === 'customer'
  const isCleared = entry.status === 'paid' || remainingAmount === 0
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
          {isCleared ? <><span className="debt-cleared-note"><Check /> Paid in full</span><button className="danger-btn settle-debt" onClick={() => onDeleteDebt?.(entry)}><Trash2 /> Delete</button></> : <button className="outline-btn settle-debt" disabled={entry.status === 'settling'} onClick={() => onPayDebt(entry)}>{entry.status === 'settling' ? 'Processing' : 'Pay now'}</button>}
        </> : <>
          <span className="debt-remaining-label">Outstanding balance</span>
          <strong className="debt-remaining-value">{money(remainingAmount)}</strong>
          {isCleared ? <span className="debt-cleared-note"><Check /> Paid in full</span> : <button className="outline-btn settle-debt" disabled={entry.status === 'settling'} onClick={() => onPayDebt(entry)}>{entry.status === 'settling' ? 'Processing' : 'Pay supplier'}</button>}
        </>}
        <div className="transaction-row-actions">
          <button className="icon-btn" type="button" title="Edit debt account" aria-label={`Edit debt ${entry.name}`} onClick={() => onEditDebt?.(entry)}><Pencil /></button>
          <button className="icon-btn danger-icon" type="button" title="Delete debt account" aria-label={`Delete debt ${entry.name}`} onClick={() => onDeleteDebt?.(entry)}><Trash2 /></button>
        </div>
      </div>
    </div>
  )
}

type BalanceSheetRow = {
  label: string
  value: string
  deduction?: boolean
}

function BalanceSheetGroup({ title, rows, totalLabel, totalValue }: { title: string; rows: BalanceSheetRow[]; totalLabel: string; totalValue: string }) {
  return (
    <section className="balance-sheet-group">
      <h5>{title}</h5>
      <div className="balance-sheet-rows">
        {rows.map((row) => (
          <div className={`balance-sheet-row${row.deduction ? ' is-deduction' : ''}`} key={row.label}>
            <span>{row.label}</span><strong>{row.value}</strong>
          </div>
        ))}
      </div>
      <div className="balance-sheet-subtotal"><span>{totalLabel}</span><strong>{totalValue}</strong></div>
    </section>
  )
}

function BalanceSheetGrandTotal({ label, value }: { label: string; value: string }) {
  return <div className="balance-sheet-grand-total"><span>{label}</span><strong>{value}</strong></div>
}

function Reports({ sales, products, pettyCash, cashMovements, purchases, expenses, totals }: any) {
  const [range, setRange] = useState<'day' | 'week' | 'month'>('day')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [productSearch, setProductSearch] = useState('')
  const [balanceSheetView, setBalanceSheetView] = useState<'standard' | 't-format'>('standard')

  const report = useMemo(() => {
    const anchor = new Date(`${selectedDate}T12:00:00`)
    const start = new Date(anchor)
    if (range === 'week') start.setDate(start.getDate() - 6)
    if (range === 'month') start.setDate(1)
    const startDate = start.toISOString().slice(0, 10)
    const entries = sales.filter((entry: Sale) => entry.paymentStatus !== 'payment' && entry.date >= startDate && entry.date <= selectedDate)
    const revenue = entries.reduce((sum: number, entry: Sale) => sum + getSaleRevenue(entry), 0)
    const vat = entries.reduce((sum: number, entry: Sale) => sum + getSaleVat(entry), 0)
    const cost = entries.flatMap((entry: Sale) => entry.items).reduce((sum: number, item: Sale['items'][number]) => sum + Number(item.buy || 0) * Number(item.qty || 0), 0)
    const periodPettyCash = pettyCash.filter((entry: PettyCash) => entry.date >= startDate && entry.date <= selectedDate)
    const periodPurchases = purchases.filter((entry: InventoryPurchase) => entry.date >= startDate && entry.date <= selectedDate)
    const periodExpenses = expenses.filter((entry: BusinessExpense) => entry.date >= startDate && entry.date <= selectedDate)
    const operatingExpenses = periodPettyCash.filter((entry: PettyCash) => entry.type === 'expense').reduce((sum: number, entry: PettyCash) => sum + Math.max(0, Number(entry.amount || 0) - Number(entry.vatAmount || 0)), 0)
      + periodExpenses.reduce((sum: number, entry: BusinessExpense) => sum + Number(entry.amountExclVat || 0), 0)
    const otherBusinessIncome = periodPettyCash.filter((entry: PettyCash) => entry.type === 'other_income').reduce((sum: number, entry: PettyCash) => sum + Number(entry.amount || 0), 0)
    const otherBusinessExpenses = periodPettyCash.filter((entry: PettyCash) => entry.type === 'other_expense').reduce((sum: number, entry: PettyCash) => sum + Math.max(0, Number(entry.amount || 0) - Number(entry.vatAmount || 0)), 0)
    const inputVat = periodPettyCash.filter((entry: PettyCash) => ['expense', 'other_expense'].includes(entry.type)).reduce((sum: number, entry: PettyCash) => sum + Number(entry.vatAmount || 0), 0)
      + periodPurchases.reduce((sum: number, entry: InventoryPurchase) => sum + Number(entry.vatAmount || 0) * Math.min(1, Number(entry.paidAmount || 0) / Math.max(Number(entry.total || 0), 1)), 0)
      + periodExpenses.reduce((sum: number, entry: BusinessExpense) => sum + Number(entry.vatAmount || 0) * Math.min(1, Number(entry.paidAmount || 0) / Math.max(Number(entry.total || 0), 1)), 0)
    const ownerDrawings = pettyCash.filter((entry: PettyCash) => entry.type === 'owner_drawing' && entry.date >= startDate && entry.date <= selectedDate).reduce((sum: number, entry: PettyCash) => sum + Number(entry.amount || 0), 0)
    const ownerContributions = pettyCash.filter((entry: PettyCash) => entry.type === 'owner_contribution' && entry.date >= startDate && entry.date <= selectedDate).reduce((sum: number, entry: PettyCash) => sum + Number(entry.amount || 0), 0)
      + cashMovements.filter((movement: { type: string; date: string; amount: number }) => movement.type === 'owner_capital' && movement.date >= startDate && movement.date <= selectedDate).reduce((sum: number, movement: { amount: number }) => sum + Number(movement.amount || 0), 0)
    const grossProfit = revenue - cost
    const operatingProfit = grossProfit - operatingExpenses
    const netProfit = operatingProfit + otherBusinessIncome - otherBusinessExpenses
    const netVat = vat - inputVat
    const vatConfigured = vat > 0 || inputVat > 0 || periodExpenses.some((entry: BusinessExpense) => entry.vatAmount > 0) || periodPurchases.some((entry: InventoryPurchase) => entry.vatAmount > 0)
    return { entries, revenue, vat, inputVat, netVat, vatConfigured, operatingExpenses, otherBusinessIncome, otherBusinessExpenses, ownerDrawings, ownerContributions, grossProfit, operatingProfit, netProfit, cost, loss: Math.max(0, -netProfit), startDate }
  }, [range, selectedDate, sales, pettyCash, cashMovements, purchases, expenses])

  const productPerformance = useMemo(() => {
    const items = report.entries.flatMap((entry: Sale) => entry.items)
    return products.map((product: Product) => {
      const soldItems = items.filter((item: Sale['items'][number]) =>
        item.productId === product.id || (!item.productId && item.name === product.name),
      )
      const revenue = soldItems.reduce((sum: number, item: Sale['items'][number]) => sum + Number(item.price || 0) * Number(item.qty || 0), 0)
      const cost = soldItems.reduce((sum: number, item: Sale['items'][number]) => sum + Number(item.buy || 0) * Number(item.qty || 0), 0)
      const quantity = soldItems.reduce((sum: number, item: Sale['items'][number]) => sum + Number(item.qty || 0), 0)
      const profit = soldItems.reduce((sum: number, item: Sale['items'][number]) => sum + (Number(item.price || 0) - Number(item.buy || 0)) * Number(item.qty || 0), 0)
      return { product, revenue, cost, quantity, profit, margin: revenue > 0 ? Math.round((profit / revenue) * 100) : 0 }
    }).sort((left: any, right: any) => right.profit - left.profit)
  }, [products, report.entries])
  const normalizedProductSearch = productSearch.trim().toLowerCase()
  const visibleProductPerformance = productPerformance.filter(({ product }: { product: Product }) =>
    product.name.toLowerCase().includes(normalizedProductSearch),
  )
  const totalProductProfit = productPerformance.reduce((sum: number, entry: any) => sum + entry.profit, 0)
  const currentAssetRows = [
    { label: 'Cash', value: money(totals.cash) },
    { label: 'Bank', value: money(totals.bank) },
    { label: 'Mobile money and other accounts', value: money(totals.mobileMoney + totals.otherAccounts) },
    { label: 'Petty cash', value: money(totals.pettyCashBalance) },
    { label: 'Customer receivables', value: money(totals.owed) },
    { label: 'Inventory', value: money(totals.inventory) },
    { label: 'VAT receivable / VAT credit', value: totals.vatCredit ? money(totals.vatCredit) : '0 RWF' },
  ]
  const nonCurrentAssetRows = [
    { label: 'Equipment', value: 'Not tracked' },
    { label: 'Furniture', value: 'Not tracked' },
    { label: 'Vehicles', value: 'Not tracked' },
    { label: 'Other fixed assets', value: 'Not tracked' },
    { label: 'Less: Accumulated depreciation', value: 'Not tracked' },
  ]
  const currentLiabilityRows = [
    { label: 'Supplier payables', value: money(totals.owe) },
    { label: 'VAT payable', value: totals.outputVat >= totals.inputVat ? money(totals.vatPayable) : '0 RWF' },
    { label: 'Other payables', value: 'Not tracked' },
  ]
  const nonCurrentLiabilityRows = [
    { label: 'Loans', value: 'Not tracked' },
    { label: 'Other long-term liabilities', value: 'Not tracked' },
  ]
  const ownerEquityRows = [
    { label: "Opening owner's capital", value: 'Not configured' },
    { label: 'Capital contributions', value: money(totals.ownerContributions) },
    { label: 'Retained earnings opening balance', value: 'Not configured' },
    { label: 'Current period net profit', value: money(report.netProfit) },
    { label: 'Less: Owner drawings', value: `−${money(totals.ownerDrawings)}`, deduction: true },
  ]

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
          <span>Sales revenue (excl. VAT)</span>
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
          <strong className={report.grossProfit >= 0 ? 'green-text' : 'negative'}>{money(report.grossProfit)}</strong>
          <small>Sales profit before expenses</small>
        </div>
        <div>
          <span>Net profit</span>
          <strong className={report.netProfit >= 0 ? 'green-text' : 'negative'}>{money(report.netProfit)}</strong>
          <small>{report.netProfit >= 0 ? 'After recorded business expenses' : `Loss: ${money(report.loss)}`}</small>
        </div>
      </div>

      <div className="financial-document panel" id="financial-report">
        <div className="document-head">
          <div><span className="eyebrow">NADINE&apos;S SHOP</span><h2>Financial statement</h2><p>{report.startDate} to {selectedDate}</p></div>
          <FileText />
        </div>
        <section className="statement-section">
          <h3>Income statement</h3>
          <div className="document-grid">
            <div><span>Sales revenue (excluding VAT)</span><strong>{money(report.revenue)}</strong></div>
            <div><span>Cost of goods sold</span><strong>−{money(report.cost)}</strong><small>Cost of inventory items sold during this period.</small></div>
            <div><span>Gross profit</span><strong className={report.grossProfit >= 0 ? 'green-text' : 'negative'}>{money(report.grossProfit)}</strong></div>
            <div><span>Recorded business expenses</span><strong>−{money(report.operatingExpenses)}</strong></div>
            <div><span>Operating profit</span><strong className={report.operatingProfit >= 0 ? 'green-text' : 'negative'}>{money(report.operatingProfit)}</strong></div>
            <div><span>Other business expenses</span><strong>−{money(report.otherBusinessExpenses)}</strong></div>
            <div><span>Other business income</span><strong>+{money(report.otherBusinessIncome)}</strong></div>
            <div><span>Net profit</span><strong className={report.netProfit >= 0 ? 'green-text' : 'negative'}>{money(report.netProfit)}</strong></div>
          </div>
        </section>
        <section className="statement-section">
          <div className="balance-sheet-toolbar">
            <div>
              <span className="eyebrow">FINANCIAL POSITION</span>
              <h3>Balance sheet</h3>
              <p>Current recorded balances as at {selectedDate} · RWF</p>
            </div>
            <div className="balance-sheet-view-switch" role="group" aria-label="Balance sheet layout">
              <button type="button" aria-pressed={balanceSheetView === 'standard'} className={balanceSheetView === 'standard' ? 'active' : ''} onClick={() => setBalanceSheetView('standard')}>Standard</button>
              <button type="button" aria-pressed={balanceSheetView === 't-format'} className={balanceSheetView === 't-format' ? 'active' : ''} onClick={() => setBalanceSheetView('t-format')}>T-format</button>
            </div>
          </div>
          {balanceSheetView === 'standard' ? (
            <div className="balance-sheet-standard">
              <div className="balance-sheet-column">
                <h4>Assets</h4>
                <BalanceSheetGroup title="Current assets" rows={currentAssetRows} totalLabel="Total current assets" totalValue="Not separately calculated" />
                <BalanceSheetGroup title="Non-current assets" rows={nonCurrentAssetRows} totalLabel="Total non-current assets" totalValue="Not tracked" />
                <BalanceSheetGrandTotal label="Total assets (recorded balances)" value={money(totals.totalAssets)} />
              </div>
              <div className="balance-sheet-column">
                <h4>Liabilities</h4>
                <BalanceSheetGroup title="Current liabilities" rows={currentLiabilityRows} totalLabel="Total current liabilities" totalValue="Not separately calculated" />
                <BalanceSheetGroup title="Non-current liabilities" rows={nonCurrentLiabilityRows} totalLabel="Total non-current liabilities" totalValue="Not tracked" />
                <BalanceSheetGrandTotal label="Total liabilities (recorded balances)" value={money(totals.totalLiabilities)} />
                <BalanceSheetGroup title="Owner’s equity" rows={ownerEquityRows} totalLabel="Current recorded equity estimate" totalValue={money(totals.knownEquity)} />
                <BalanceSheetGrandTotal label="Total liabilities & owner’s equity" value="Not separately calculated" />
              </div>
            </div>
          ) : (
            <div className="balance-sheet-t">
              <div className="balance-sheet-t-column">
                <h4>Assets</h4>
                <BalanceSheetGroup title="Current assets" rows={currentAssetRows} totalLabel="Total current assets" totalValue="Not separately calculated" />
                <BalanceSheetGroup title="Non-current assets" rows={nonCurrentAssetRows} totalLabel="Total non-current assets" totalValue="Not tracked" />
                <BalanceSheetGrandTotal label="Total assets (recorded balances)" value={money(totals.totalAssets)} />
              </div>
              <div className="balance-sheet-t-column">
                <h4>Liabilities & owner’s equity</h4>
                <BalanceSheetGroup title="Current liabilities" rows={currentLiabilityRows} totalLabel="Total current liabilities" totalValue="Not separately calculated" />
                <BalanceSheetGroup title="Non-current liabilities" rows={nonCurrentLiabilityRows} totalLabel="Total non-current liabilities" totalValue="Not tracked" />
                <BalanceSheetGrandTotal label="Total liabilities (recorded balances)" value={money(totals.totalLiabilities)} />
                <BalanceSheetGroup title="Owner’s equity" rows={ownerEquityRows} totalLabel="Current recorded equity estimate" totalValue={money(totals.knownEquity)} />
                <BalanceSheetGrandTotal label="Total liabilities & owner’s equity" value="Not separately calculated" />
              </div>
            </div>
          )}
          <section className="balance-check">
            <div className="balance-check-heading">
              <span className="balance-check-icon"><AlertTriangle /></span>
              <div><h4>Balance check</h4><p>Accounting equation review</p></div>
              <span className={`balance-check-status ${totals.balanceDifference === 0 ? 'is-balanced' : 'is-incomplete'}`}>{totals.balanceDifference === 0 ? 'Balanced' : 'Incomplete'}</span>
            </div>
            <div className="balance-check-values">
              <div><span>Total assets</span><strong>{money(totals.totalAssets)}</strong></div>
              <div><span>Total liabilities</span><strong>{money(totals.totalLiabilities)}</strong></div>
              <div><span>Owner’s equity estimate</span><strong>{money(totals.knownEquity)}</strong></div>
              <div className="balance-check-difference"><span>Unreconciled difference</span><strong className={Math.abs(totals.balanceDifference) < 1 ? 'green-text' : 'negative'}>{money(totals.balanceDifference)}</strong></div>
            </div>
            <div className="balance-check-equation">Assets = Liabilities + Owner’s Equity</div>
          </section>
        </section>
      </div>

      <section className="panel product-performance-panel">
        <div className="performance-header">
          <div>
            <span className="eyebrow">PRODUCT ANALYSIS</span>
            <h2>Product performance</h2>
            <p>Profit contribution by product</p>
          </div>
          <div className="performance-total">
            <span>Profit in selected period</span>
            <strong className={totalProductProfit >= 0 ? 'green-text' : 'negative'}>{money(totalProductProfit)}</strong>
          </div>
        </div>
        <div className="performance-controls">
          <label className="performance-search">
            <Search />
            <input aria-label="Search product performance" placeholder="Search products..." value={productSearch} onChange={(event) => setProductSearch(event.target.value)} />
            {productSearch && <button type="button" aria-label="Clear product search" onClick={() => setProductSearch('')}><X /></button>}
          </label>
          <span className="performance-count">{visibleProductPerformance.length} of {products.length} products</span>
        </div>
        <div className={`product-performance-list${visibleProductPerformance.length > 3 ? ' is-scrollable' : ''}`}>
          {visibleProductPerformance.length ? visibleProductPerformance.map((entry: any, index: number) => (
            <article className="performance-row" key={entry.product.id}>
              <div className="performance-identity">
                <span className="performance-rank">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{entry.product.name}</strong>
                  <small>{formatQuantity(entry.quantity, entry.product.unit)} sold</small>
                </div>
              </div>
              <div className="performance-financials">
                <div><span>Revenue</span><strong>{money(entry.revenue)}</strong></div>
                <div><span>Cost</span><strong>{money(entry.cost)}</strong></div>
              </div>
              <div className="performance-profit">
                <div className="performance-profit-heading"><span>Profit</span><strong className={entry.profit >= 0 ? 'green-text' : 'negative'}>{money(entry.profit)}</strong></div>
                <div className="performance-track"><i style={{ width: `${Math.max(0, Math.min(100, entry.margin))}%` }} /></div>
                <small>{entry.margin}% margin</small>
              </div>
            </article>
          )) : (
            <div className="performance-empty">
              <Search />
              <strong>{productPerformance.length ? 'No matching products' : 'No product sales in this period'}</strong>
              <span>{productPerformance.length ? 'Try another product name.' : 'Product contribution will appear after a sale is recorded.'}</span>
            </div>
          )}
        </div>
      </section>
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

function ProductModal({ product, close, onSave }: { product?: Product | null; close: () => void; onSave: (payload: ProductFormInput) => Promise<void> }) {
  const [name, setName] = useState(product?.name ?? '')
  const [category, setCategory] = useState(product?.category ?? 'Groceries')
  const [stock, setStock] = useState(product ? String(product.stock) : '')
  const [unit, setUnit] = useState(product?.unit ?? 'pieces')
  const [buy, setBuy] = useState(product ? String(product.buy) : '')
  const [sell, setSell] = useState(product ? String(product.sell) : '')
  const [min, setMin] = useState(product ? String(product.min) : '5')
  const [openingPayment, setOpeningPayment] = useState<'cash' | 'credit'>('cash')
  const [supplier, setSupplier] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const openingValue = Number(stock || 0) * Number(buy || 0)

  const save = async () => {
    const payload = {
      name: name.trim(),
      category,
      stock: Number(stock || 0),
      unit,
      buy: Number(buy || 0),
      sell: Number(sell || 0),
      min: Number(min || 5),
      ...(!product && openingValue > 0 ? { openingPayment, supplier: supplier.trim(), paymentMethod } : {}),
    }
    if (!payload.name || payload.stock < 0 || (!product && openingValue > 0 && openingPayment === 'credit' && !supplier.trim())) {
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
      {!product && openingValue > 0 && <section className="opening-stock-payment">
        <div className="opening-stock-summary"><span>Opening stock value</span><strong>{money(openingValue)}</strong><small>Opening quantity × buying price</small></div>
        <fieldset className="payment-choice">
          <legend>How was this opening stock purchased?</legend>
          <label><input type="radio" name="opening-stock-payment" checked={openingPayment === 'cash'} onChange={() => setOpeningPayment('cash')} /> Cash / paid now</label>
          <label><input type="radio" name="opening-stock-payment" checked={openingPayment === 'credit'} onChange={() => setOpeningPayment('credit')} /> Credit / pay supplier later</label>
        </fieldset>
        {openingPayment === 'credit' ? <label className="opening-stock-field">Supplier<input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Supplier name" /></label> : <label className="opening-stock-field">Paid from<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Main cash</option><option value="petty_cash">Petty cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile Money</option><option value="other">Other</option></select></label>}
      </section>}
      <button className="primary-btn full" disabled={!name.trim() || stock === '' || Number(stock) < 0 || (!product && openingValue > 0 && !openingPayment) || (!product && openingValue > 0 && openingPayment === 'credit' && !supplier.trim())} onClick={() => void save()}>
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

function DebtModal({ debt, close, onSave }: { debt?: Debt | null; close: () => void; onSave: (payload: { name: string; phone?: string; amount?: number; kind: 'customer' | 'supplier'; due: string; description?: string }) => Promise<void> }) {
  const [name, setName] = useState(debt?.name ?? '')
  const [phone, setPhone] = useState(debt?.phone ?? '')
  const [amount, setAmount] = useState(debt ? String(debt.amount) : '')
  const [kind, setKind] = useState<'customer' | 'supplier'>(debt?.kind ?? 'customer')
  const [description, setDescription] = useState(debt?.description ?? '')
  const [due, setDue] = useState(debt?.due ?? new Date().toISOString().slice(0, 10))

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
    <Modal title={debt ? 'Edit debt account' : 'Add debt account'} close={close}>
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
        {debt ? 'Save debt changes' : 'Save account'} <Check />
      </button>
    </Modal>
  )
}

function BusinessExpenseModal({ expense, close, onSave, onDelete }: { expense?: BusinessExpense | null; close: () => void; onSave: (input: { date: string; category: string; description: string; supplier: string; amountExclVat: number; vatAmount: number; paymentStatus: 'paid' | 'unpaid'; paymentMethod: string }) => Promise<void>; onDelete?: () => void }) {
  const [date, setDate] = useState(expense?.date ?? new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState(expense?.category ?? 'Other operating expense')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [supplier, setSupplier] = useState(expense?.supplier ?? '')
  const [amountExclVat, setAmountExclVat] = useState(expense ? String(expense.amountExclVat) : '')
  const [vatAmount, setVatAmount] = useState(expense ? String(expense.vatAmount) : '0')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>(expense?.paymentStatus === 'unpaid' ? 'unpaid' : 'paid')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave({ date, category, description: description.trim(), supplier: supplier.trim(), amountExclVat: Number(amountExclVat), vatAmount: Number(vatAmount || 0), paymentStatus, paymentMethod })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to record business expense.')
      setSaving(false)
    }
  }

  return (
    <Modal title={expense ? 'Edit business expense' : 'Record business expense'} close={close}>
      <div className="form-grid">
        <label>Expense date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Rent</option><option>Electricity</option><option>Internet</option><option>Transport</option><option>Salaries</option><option>Repairs</option><option>Packaging</option><option>Advertising</option><option>Bank charges</option><option>Cleaning</option><option>Office supplies</option><option>Other operating expense</option></select></label>
        <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was this expense for?" /></label>
        <label>Supplier / payee (optional)<input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Supplier or service provider" /></label>
        <label>Amount excluding VAT<input type="number" min="0.01" step="0.01" value={amountExclVat} onChange={(event) => setAmountExclVat(event.target.value)} /></label>
        <label>Input VAT<input type="number" min="0" step="0.01" value={vatAmount} onChange={(event) => setVatAmount(event.target.value)} /></label>
        {!expense && <label>Payment status<select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as 'paid' | 'unpaid')}><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select></label>}
        {!expense && paymentStatus === 'paid' && <label>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="petty_cash">Petty cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile Money</option><option value="other">Other</option></select></label>}
        {expense && <div className="expense-edit-status">Payment status: <strong>{expense.paymentStatus}</strong> · Paid {money(expense.paidAmount)} of {money(expense.total)}</div>}
      </div>
      <div className="payment-remaining"><span>Total expense including VAT</span><strong>{money(Number(amountExclVat || 0) + Number(vatAmount || 0))}</strong></div>
      {error ? <div className="error-text">{error}</div> : null}
      {onDelete && <button className="danger-btn expense-delete-action" type="button" onClick={onDelete}><Trash2 /> Delete expense</button>}
      <button className="primary-btn full" disabled={saving || !description.trim() || Number(amountExclVat) <= 0 || Number(vatAmount) < 0} onClick={() => void save()}>{saving ? 'Saving expense…' : expense ? 'Save expense changes' : 'Save expense'} <Check /></button>
    </Modal>
  )
}

function PettyCashEditModal({ entry, close, onSave, onDelete }: { entry: PettyCash; close: () => void; onSave: (input: { amount: number; reason: string; date: string; category: string; vatAmount: number }) => Promise<void>; onDelete: () => void }) {
  const [amount, setAmount] = useState(String(entry.amount))
  const [reason, setReason] = useState(entry.reason)
  const [date, setDate] = useState(entry.date)
  const [vatAmount, setVatAmount] = useState(String(entry.vatAmount ?? 0))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave({ amount: Number(amount), reason: reason.trim(), date, category: entry.category ?? '', vatAmount: Number(vatAmount || 0) })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update petty-cash transaction.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Edit petty-cash transaction" close={close}>
      <div className="form-grid">
        <label>Transaction type<input readOnly value={entry.category || entry.type.replaceAll('_', ' ')} /></label>
        <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Amount<input type="number" min="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        {['expense', 'other_expense', 'business_expense_payment'].includes(entry.type) && <label>VAT<input type="number" min="0" max={amount} value={vatAmount} onChange={(event) => setVatAmount(event.target.value)} /></label>}
        <label>Description<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      </div>
      {error ? <div className="error-text">{error}</div> : null}
      <button className="danger-btn expense-delete-action" type="button" onClick={onDelete}><Trash2 /> Delete transaction</button>
      <button className="primary-btn full" disabled={saving || !reason.trim() || Number(amount) <= 0 || Number(vatAmount) < 0 || Number(vatAmount) > Number(amount)} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'} <Check /></button>
    </Modal>
  )
}

function PettyCashModal({ action, close, onSave }: { action: 'receive' | 'withdraw' | 'drawing'; close: () => void; onSave: (payload: { amount: number; reason: string; date: string; type: PettyCash['type']; category: string; vatAmount: number; paymentMethod: string }) => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState(action === 'drawing' ? 'owner_drawing' : '')
  const [category, setCategory] = useState('Other operating expense')
  const [vatAmount, setVatAmount] = useState('0')
  const [transferAccount, setTransferAccount] = useState('cash')
  const receiving = action === 'receive'

  const save = async () => {
    if (!amount || !reason.trim() || !type) {
      return
    }
    const normalizedType = type === 'opening_balance' ? 'owner_contribution' : type
    const movementCategory = type === 'opening_balance'
      ? 'Opening petty cash balance'
      : type === 'owner_contribution'
        ? 'Owner capital contribution'
        : type === 'bank_transfer_in'
          ? 'Transfer from bank'
          : type === 'cash_transfer_in'
            ? 'Transfer from main cash'
            : type === 'other_income'
              ? 'Other business income'
              : type === 'owner_drawing'
                ? 'Owner drawing'
                : ['expense', 'other_expense'].includes(type)
                  ? category
                  : 'Cash transfer'
    await onSave({ amount: Number(amount), reason: reason.trim(), date, type: normalizedType as PettyCash['type'], category: movementCategory, vatAmount: ['expense', 'other_expense'].includes(type) ? Number(vatAmount || 0) : 0, paymentMethod: transferAccount })
  }

  return (
    <Modal title={receiving ? 'Add money to Petty Cash' : action === 'drawing' ? 'Record owner drawing' : 'Withdraw from Petty Cash'} close={close}>
      <div className="form-grid">
        {action === 'drawing' ? <label>Category<input readOnly value="Owner drawing" /></label> : <label>{receiving ? 'Source type' : 'Withdrawal type'}<select required value={type} onChange={(event) => setType(event.target.value)}><option value="">{receiving ? 'Choose where the money came from' : 'Choose withdrawal purpose'}</option>{receiving ? <><option value="owner_contribution">Owner capital contribution</option><option value="opening_balance">Opening petty cash balance</option><option value="bank_transfer_in">Transfer from bank</option><option value="cash_transfer_in">Transfer from main cash</option><option value="other_income">Other business income</option></> : <><option value="expense">Business purpose</option><option value="other_expense">Other business expense</option><option value="owner_drawing">Personal expense</option><option value="transfer">Transfer to another account</option></>}</select></label>}
        {!receiving && ['expense', 'other_expense'].includes(type) && <label>Expense category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Rent</option><option>Electricity</option><option>Internet</option><option>Transport</option><option>Salaries</option><option>Repairs</option><option>Packaging</option><option>Advertising</option><option>Bank charges</option><option>Cleaning</option><option>Office supplies</option><option>Other operating expense</option></select></label>}
        <label>Amount<input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="RWF" /></label>
        <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {!receiving && ['expense', 'other_expense'].includes(type) && <label>VAT included in amount<input type="number" min="0" max={amount || undefined} value={vatAmount} onChange={(event) => setVatAmount(event.target.value)} /></label>}
        {!receiving && type === 'transfer' && <label>Transfer destination<select value={transferAccount} onChange={(event) => setTransferAccount(event.target.value)}><option value="cash">Main cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile Money</option><option value="other">Other</option></select></label>}
        <label>{receiving ? 'Source / reason' : action === 'drawing' ? 'Reason for withdrawal' : 'Purpose / explanation'}<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={receiving ? 'e.g. Owner added working cash' : type === 'owner_drawing' ? 'e.g. Personal use' : 'e.g. Bought cleaning materials'} /></label>
      </div>
      <button className="primary-btn full" disabled={!type || !amount || Number(amount) <= 0 || !reason.trim()} onClick={() => void save()}>{receiving ? 'Add money to petty cash' : type === 'owner_drawing' ? 'Save personal withdrawal' : type === 'transfer' ? 'Record cash transfer' : 'Save business withdrawal'} <Wallet /></button>
    </Modal>
  )
}

function OwnerCapitalModal({ close, onSave }: { close: () => void; onSave: (input: { amount: number; date: string }) => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(getLocalDateInputValue())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave({ amount: Number(amount), date })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to add owner capital.')
      setSaving(false)
    }
  }

  return (
    <Modal title="Add owner&apos;s capital" close={close}>
      <div className="form-grid">
        <label>Date added<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        <label>Amount<input type="number" min="0.01" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="RWF" required /></label>
      </div>
      <small>Recorded as opening cash from 12:00 AM on the selected date.</small>
      {error ? <div className="error-text">{error}</div> : null}
      <button className="primary-btn full" disabled={saving || !date || !amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0} onClick={() => void save()}>{saving ? 'Saving…' : 'Add owner capital'} <Wallet /></button>
    </Modal>
  )
}

function InventoryPurchaseModal({ purchase, products, close, onSave, onCreateProduct, onDelete }: { purchase?: InventoryPurchase | null; products: Product[]; close: () => void; onSave: (input: { supplier: string; date: string; items: { productId: number; qty: number; unitCost: number }[]; vatAmount: number; paidAmount: number; paymentMethod: string }) => Promise<void>; onCreateProduct: (input: ProductFormInput) => Promise<Product>; onDelete?: () => void }) {
  const [supplier, setSupplier] = useState(purchase?.supplier ?? '')
  const [date, setDate] = useState(purchase?.date ?? new Date().toISOString().slice(0, 10))
  const [productId, setProductId] = useState('')
  const [items, setItems] = useState<{ productId: number; qty: number; unitCost: number }[]>(purchase?.items.map((item) => ({ productId: item.productId, qty: item.qty, unitCost: item.unitCost })) ?? [])
  const [vatAmount, setVatAmount] = useState(String(purchase?.vatAmount ?? 0))
  const [paymentTerms, setPaymentTerms] = useState<'cash' | 'credit' | 'partial' | ''>(purchase ? purchase.paymentMethod === 'credit' ? 'credit' : purchase.paidAmount >= purchase.total ? 'cash' : purchase.paidAmount > 0 ? 'partial' : 'credit' : '')
  const [partialPaidAmount, setPartialPaidAmount] = useState(purchase && purchase.paidAmount > 0 && purchase.paidAmount < purchase.total ? String(purchase.paidAmount) : '')
  const [paymentMethod, setPaymentMethod] = useState(purchase?.paymentMethod && purchase.paymentMethod !== 'credit' ? purchase.paymentMethod : 'cash')
  const [error, setError] = useState('')
  const [itemMessage, setItemMessage] = useState('Select a product to enable Add item.')
  const [showProductForm, setShowProductForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const purchaseLinesRef = useRef<HTMLDivElement>(null)
  const addedProductId = useRef<number | null>(null)
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
  const total = subtotal + Number(vatAmount || 0)
  const paidAmount = paymentTerms === 'cash' ? total : paymentTerms === 'credit' ? 0 : Number(partialPaidAmount || 0)
  const paymentTermsValid = paymentTerms === 'cash' || paymentTerms === 'credit' || (paymentTerms === 'partial' && paidAmount > 0 && paidAmount < total)

  useEffect(() => {
    if (addedProductId.current === null) return
    const row = purchaseLinesRef.current?.querySelector(`[data-product-id="${addedProductId.current}"]`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    addedProductId.current = null
  }, [items])

  const addItem = () => {
    const product = products.find((entry) => entry.id === Number(productId))
    if (!product) {
      setItemMessage('Choose an available product before adding it.')
      return
    }
    if (items.some((item) => item.productId === product.id)) {
      setItemMessage(`${product.name} is already in this purchase.`)
      return
    }
    addedProductId.current = product.id
    setItems((current) => [...current, { productId: product.id, qty: 1, unitCost: product.buy }])
    setProductId('')
    setItemMessage(`${product.name} added to this purchase.`)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave({ supplier: supplier.trim(), date, items, vatAmount: Number(vatAmount || 0), paidAmount: Number(paidAmount || 0), paymentMethod: paymentTerms === 'credit' ? 'credit' : paymentMethod })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to record inventory purchase.')
      setSaving(false)
    }
  }

  return (
    <Modal title={purchase ? `Edit inventory purchase ${purchase.id}` : 'Receive inventory purchase'} close={close}>
      <div className="form-grid">
        <label>Supplier<input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Supplier name" /></label>
        <label>Purchase date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      </div>
      <div className="purchase-add-row">
        <label>Product<select value={productId} onChange={(event) => {
          setProductId(event.target.value)
          setItemMessage(event.target.value ? 'Ready to add selected product.' : 'Select a product to enable Add item.')
        }}><option value="">Select product</option>{products.filter((product) => !items.some((item) => item.productId === product.id)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <button className="outline-btn" type="button" disabled={!productId} onClick={addItem}><Plus /> Add item</button>
        <button className="outline-btn" type="button" onClick={() => setShowProductForm(true)}><Package /> Add product</button>
      </div>
      <div className="purchase-item-feedback" role="status">{itemMessage}</div>
      <div className="purchase-lines" ref={purchaseLinesRef}>
        {items.map((item) => {
          const product = products.find((entry) => entry.id === item.productId)
          if (!product) return null
          return <div className="purchase-line" data-product-id={item.productId} key={item.productId}>
            <strong>{product.name}<small>Current stock: {formatQuantity(product.stock, product.unit)}</small></strong>
            <label>Quantity<input type="number" min="0.01" step={getQuantityStep(product.unit)} value={item.qty} onChange={(event) => setItems((current) => current.map((entry) => entry.productId === item.productId ? { ...entry, qty: Number(event.target.value) } : entry))} /></label>
            <label>Unit cost<input type="number" min="0" step="1" value={item.unitCost} onChange={(event) => setItems((current) => current.map((entry) => entry.productId === item.productId ? { ...entry, unitCost: Number(event.target.value) } : entry))} /></label>
            <button className="icon-btn danger-icon" type="button" aria-label={`Remove ${product.name}`} onClick={() => setItems((current) => current.filter((entry) => entry.productId !== item.productId))}><X /></button>
          </div>
        })}
        {!items.length && <div className="empty-state">Add products received from this supplier.</div>}
      </div>
      <div className="form-grid purchase-payment-fields">
        <label>Input VAT<input type="number" min="0" value={vatAmount} onChange={(event) => setVatAmount(event.target.value)} /></label>
      </div>
      <fieldset className="payment-choice purchase-terms-choice">
        <legend>How was this inventory purchased?</legend>
        <label><input type="radio" name="purchase-terms" value="cash" checked={paymentTerms === 'cash'} onChange={() => setPaymentTerms('cash')} /> Cash / paid now</label>
        <label><input type="radio" name="purchase-terms" value="credit" checked={paymentTerms === 'credit'} onChange={() => setPaymentTerms('credit')} /> Credit / pay supplier later</label>
        <label><input type="radio" name="purchase-terms" value="partial" checked={paymentTerms === 'partial'} onChange={() => setPaymentTerms('partial')} /> Partial payment</label>
      </fieldset>
      {paymentTerms === 'partial' && <div className="form-grid purchase-payment-fields">
        <label>Amount paid now<input type="number" min="0" max={total} value={partialPaidAmount} onChange={(event) => setPartialPaidAmount(event.target.value)} /></label>
        <label>Payment account<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="petty_cash">Petty cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile Money</option><option value="other">Other</option></select></label>
      </div>}
      {paymentTerms === 'cash' && <div className="form-grid purchase-payment-fields"><label>Payment account<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="cash">Cash</option><option value="petty_cash">Petty cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile Money</option><option value="other">Other</option></select></label></div>}
      <div className="payment-remaining"><span>Inventory subtotal {money(subtotal)} · Purchase total {money(total)} · Paid now {money(paidAmount)}</span><strong>Supplier balance {money(Math.max(0, total - paidAmount))}</strong></div>
      {error ? <div className="error-text">{error}</div> : null}
      {onDelete && <button className="danger-btn purchase-delete-action" type="button" onClick={onDelete}><Trash2 /> Delete purchase</button>}
      <button className="primary-btn full" disabled={saving || !supplier.trim() || !items.length || !paymentTermsValid || items.some((item) => item.qty <= 0 || item.unitCost < 0) || Number(vatAmount) < 0 || paidAmount < 0 || paidAmount > total} onClick={() => void save()}>{saving ? 'Saving purchase…' : purchase ? 'Save purchase changes' : paymentTerms === 'credit' ? 'Save credit purchase' : 'Save inventory purchase'} <Check /></button>
      {showProductForm && <ProductModal product={null} close={() => setShowProductForm(false)} onSave={async (input) => {
        try {
          const product = await onCreateProduct(input)
          setShowProductForm(false)
          setItemMessage(`${product.name} is now available in the selector. Opening stock entered above was recorded separately.`)
        } catch (createError) {
          setItemMessage(createError instanceof Error ? createError.message : 'Unable to add product.')
        }
      }} />}
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
            Subtotal <strong>{money(sale.total - getSaleVat(sale))}</strong>
          </span>
          {sale.vat && (
            <span>
              VAT (18%) <strong>{money(getSaleVat(sale))}</strong>
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

function DeleteConfirmationModal({ message, onCancel, onConfirm }: { message: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal title="Confirm deletion" close={onCancel}>
      <div className="delete-confirmation">
        <span className="delete-confirmation-icon"><Trash2 /></span>
        <div className="delete-confirmation-copy">
          <strong>This action may reverse related records.</strong>
          <p>{message}</p>
        </div>
      </div>
      <div className="delete-confirmation-actions">
        <button className="outline-btn" type="button" onClick={onCancel}>Cancel</button>
        <button className="danger-btn" type="button" onClick={onConfirm}>OK <Trash2 /></button>
      </div>
    </Modal>
  )
}