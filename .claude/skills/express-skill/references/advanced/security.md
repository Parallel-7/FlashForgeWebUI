# Express Security Best Practices

Security best practices for Express applications in production.

## Overview

Production environments have vastly different requirements from development:
- Verbose error logging becomes a security concern
- Scalability, reliability, and performance become critical
- Security vulnerabilities can be exploited

## Don't Use Deprecated or Vulnerable Versions

- Express 2.x and 3.x are no longer maintained
- Check the [Security Updates page](https://expressjs.com/en/advanced/security-updates.html)
- Update to the latest stable release

```bash
npm install express@latest
npm audit
```

## Use TLS (HTTPS)

If your app deals with sensitive data, use Transport Layer Security:

- Encrypts data before transmission
- Prevents packet sniffing and man-in-the-middle attacks
- Use Nginx to handle TLS termination

**Resources:**
- [Let's Encrypt](https://letsencrypt.org/) - Free TLS certificates
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)

## Do Not Trust User Input

One of the most critical security requirements is proper input validation.

### Prevent Open Redirects

Never redirect to user-supplied URLs without validation:

```javascript
// VULNERABLE
app.get('/redirect', (req, res) => {
  res.redirect(req.query.url)  // Attacker can redirect to phishing site
})

// SECURE
app.get('/redirect', (req, res) => {
  try {
    const url = new URL(req.query.url)
    if (url.host !== 'example.com') {
      return res.status(400).send(`Unsupported redirect to host: ${url.host}`)
    }
    res.redirect(req.query.url)
  } catch (e) {
    res.status(400).send(`Invalid url: ${req.query.url}`)
  }
})
```

### Input Validation

Use validation libraries:

```javascript
const { body, validationResult } = require('express-validator')

app.post('/user',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('name').trim().escape(),
  (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    // Process validated input
  }
)
```

## Use Helmet

[Helmet](https://helmetjs.github.io/) sets security-related HTTP headers:

```bash
npm install helmet
```

```javascript
const helmet = require('helmet')
app.use(helmet())
```

### Headers Set by Helmet (Defaults)

| Header | Purpose |
|--------|---------|
| `Content-Security-Policy` | Mitigates XSS and data injection attacks |
| `Cross-Origin-Opener-Policy` | Process-isolates your page |
| `Cross-Origin-Resource-Policy` | Blocks cross-origin resource loading |
| `Origin-Agent-Cluster` | Origin-based process isolation |
| `Referrer-Policy` | Controls Referer header |
| `Strict-Transport-Security` | Enforces HTTPS |
| `X-Content-Type-Options` | Prevents MIME sniffing |
| `X-DNS-Prefetch-Control` | Controls DNS prefetching |
| `X-Download-Options` | Forces downloads to be saved (IE only) |
| `X-Frame-Options` | Mitigates clickjacking |
| `X-Permitted-Cross-Domain-Policies` | Controls Adobe cross-domain behavior |
| `X-XSS-Protection` | Disabled (can make things worse) |

### Custom Helmet Configuration

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.example.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "*.cloudinary.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}))
```

## Reduce Fingerprinting

Disable the `X-Powered-By` header:

```javascript
app.disable('x-powered-by')
```

Customize error responses to avoid revealing Express:

```javascript
// Custom 404
app.use((req, res, next) => {
  res.status(404).send("Sorry can't find that!")
})

// Custom error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).send('Something broke!')
})
```

## Use Cookies Securely

### Don't Use Default Session Cookie Name

```javascript
const session = require('express-session')

app.use(session({
  secret: process.env.SESSION_SECRET,
  name: 'sessionId',  // Change from default 'connect.sid'
  resave: false,
  saveUninitialized: false,
}))
```

### Set Cookie Security Options

```javascript
const session = require('cookie-session')

app.use(session({
  name: 'session',
  keys: [process.env.COOKIE_KEY1, process.env.COOKIE_KEY2],
  cookie: {
    secure: true,        // HTTPS only
    httpOnly: true,      // No client JS access
    domain: 'example.com',
    path: '/',
    sameSite: 'strict',  // CSRF protection
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
}))
```

### Cookie Options Explained

| Option | Description |
|--------|-------------|
| `secure` | Only send over HTTPS |
| `httpOnly` | Prevents client JavaScript access (XSS protection) |
| `domain` | Cookie domain scope |
| `path` | Cookie path scope |
| `sameSite` | CSRF protection: `'strict'`, `'lax'`, or `'none'` |
| `maxAge` | Expiration time in milliseconds |
| `expires` | Expiration date |

### Session Storage Options

**express-session**: Stores session data on server, only session ID in cookie
- Use a production session store (Redis, MongoDB, etc.)
- Default in-memory store is not for production

**cookie-session**: Stores entire session in cookie
- Good for small, non-sensitive session data
- Keep under 4093 bytes

```javascript
// express-session with Redis
const session = require('express-session')
const RedisStore = require('connect-redis').default
const { createClient } = require('redis')

const redisClient = createClient()
redisClient.connect()

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, httpOnly: true, sameSite: 'strict' }
}))
```

## Prevent Brute-Force Attacks

Use rate limiting for authentication endpoints:

```bash
npm install rate-limiter-flexible
```

```javascript
const { RateLimiterMemory } = require('rate-limiter-flexible')

const rateLimiter = new RateLimiterMemory({
  points: 10,     // 10 attempts
  duration: 60,   // per 60 seconds
})

app.post('/login', async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip)
    // Proceed with login
  } catch (rejRes) {
    res.status(429).send('Too Many Requests')
  }
})
```

### More Sophisticated Rate Limiting

```javascript
const { RateLimiterRedis } = require('rate-limiter-flexible')

// Block by IP + username combination
const limiterConsecutiveFailsByUsernameAndIP = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_fail_consecutive_username_and_ip',
  points: 10,
  duration: 60 * 60 * 24,  // 24 hours
  blockDuration: 60 * 60,  // Block for 1 hour
})

// Block by IP only for distributed attacks
const limiterSlowBruteByIP = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_fail_ip_per_day',
  points: 100,
  duration: 60 * 60 * 24,  // 24 hours
  blockDuration: 60 * 60 * 24,  // Block for 24 hours
})
```

## Ensure Dependencies Are Secure

### npm audit

```bash
npm audit
npm audit fix
```

### Snyk

```bash
npm install -g snyk
snyk test
snyk monitor  # Continuous monitoring
```

### Keep Dependencies Updated

```bash
npm outdated
npm update
```

## Prevent SQL Injection

Use parameterized queries or ORMs:

```javascript
// VULNERABLE
const query = `SELECT * FROM users WHERE id = ${req.params.id}`

// SECURE - Parameterized query
const query = 'SELECT * FROM users WHERE id = ?'
db.query(query, [req.params.id])

// SECURE - Using an ORM (Sequelize)
const user = await User.findByPk(req.params.id)
```

## Prevent Cross-Site Scripting (XSS)

### Sanitize Output

Use template engines that escape output by default (Pug, EJS, Handlebars).

```javascript
// Manual escaping if needed
const escapeHtml = (str) => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
```

### Content Security Policy

Configure CSP with Helmet:

```javascript
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
  },
}))
```

## Prevent CSRF

Use CSRF tokens:

```bash
npm install csurf
```

```javascript
const csrf = require('csurf')

// After cookie-parser and session middleware
app.use(csrf({ cookie: true }))

// Pass token to views
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken()
  next()
})

// In form template
// <input type="hidden" name="_csrf" value="<%= csrfToken %>">
```

Or use `sameSite` cookies (simpler):

```javascript
app.use(session({
  cookie: {
    sameSite: 'strict'  // Or 'lax' for GET requests from external sites
  }
}))
```

## Additional Security Measures

### Disable Directory Listing

```javascript
// express.static doesn't list directories by default
// But ensure no other middleware does
```

### Limit Request Body Size

```javascript
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ limit: '10kb', extended: true }))
```

### Set Appropriate Timeouts

```javascript
const server = app.listen(3000)
server.setTimeout(30000)  // 30 seconds
server.keepAliveTimeout = 65000  // Slightly higher than ALB timeout
```

### Use Regular Expression Safely

Avoid ReDoS attacks:

```bash
npm install safe-regex
```

```javascript
const safeRegex = require('safe-regex')

if (!safeRegex(userProvidedRegex)) {
  throw new Error('Invalid regex pattern')
}
```

## Security Checklist

### Essential

- [ ] Use HTTPS (TLS)
- [ ] Use Helmet
- [ ] Disable `x-powered-by`
- [ ] Validate and sanitize all user input
- [ ] Use parameterized queries
- [ ] Set secure cookie options
- [ ] Implement rate limiting
- [ ] Keep dependencies updated
- [ ] Run `npm audit` regularly

### Recommended

- [ ] Use Content Security Policy
- [ ] Implement CSRF protection
- [ ] Use HTTP Strict Transport Security (HSTS)
- [ ] Limit request body size
- [ ] Set appropriate timeouts
- [ ] Log security events
- [ ] Use secure session storage (Redis, etc.)
- [ ] Implement account lockout after failed attempts

### Production Environment

- [ ] Set `NODE_ENV=production`
- [ ] Don't expose error details to clients
- [ ] Use a reverse proxy (Nginx)
- [ ] Enable request logging
- [ ] Monitor for security events
- [ ] Have an incident response plan
