import { createHmac, timingSafeEqual } from 'node:crypto'

export type UserSession = {
  username: string
  role: string
  expiresAt: number
}

const SESSION_COOKIE = 'nadine-session'

function getSessionSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.MONGODB_URI
  if (!secret) throw new Error('Set AUTH_SECRET or MONGODB_URI to sign login sessions.')
  return secret
}

export function createSessionToken(username: string, role: string) {
  const payload: UserSession = {
    username,
    role,
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', getSessionSecret()).update(encodedPayload).digest('base64url')
  return `${encodedPayload}.${signature}`
}

export function readSessionToken(token: string | undefined): UserSession | null {
  if (!token) return null

  const [encodedPayload, signature, extra] = token.split('.')
  if (!encodedPayload || !signature || extra) return null

  try {
    const expected = createHmac('sha256', getSessionSecret()).update(encodedPayload).digest()
    const received = Buffer.from(signature, 'base64url')
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null

    const session = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as UserSession
    if (!session.username || !session.role || session.expiresAt <= Date.now()) return null
    return session
  } catch {
    return null
  }
}

export function readRequestSession(request: Request) {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const token = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)

  return readSessionToken(token)
}

export { SESSION_COOKIE }
