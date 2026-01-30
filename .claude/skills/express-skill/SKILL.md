---
name: express
description: Express.js 5.x web framework for Node.js - complete API reference, middleware patterns, routing, error handling, and production best practices. Use when building Express applications, creating REST APIs, implementing middleware, handling routes, managing errors, configuring security, optimizing performance, or migrating from Express 4 to 5. Triggers on Express, express.js, Node.js web server, REST API, middleware, routing, req/res objects, app.use, app.get, app.post, router, error handling, body-parser, static files, template engines.
---

# Express.js 5.x Development Skill

Express is a minimal and flexible Node.js web application framework providing robust features for web and mobile applications. This skill covers Express 5.x (current stable, requires Node.js 18+).

## Quick Reference

### Creating an Express Application

```javascript
const express = require('express')
const app = express()

// Built-in middleware
app.use(express.json())                    // Parse JSON bodies
app.use(express.urlencoded({ extended: true })) // Parse URL-encoded bodies
app.use(express.static('public'))          // Serve static files

// Route handling
app.get('/', (req, res) => {
  res.send('Hello World')
})

app.listen(3000, () => {
  console.log('Server running on port 3000')
})
```

### Express 5.x Key Changes from v4

Express 5 has breaking changes - review before migrating:

- **Async error handling**: Rejected promises automatically call `next(err)`
- **Wildcard routes**: Must be named: `/*splat` not `/*`
- **Optional params**: Use braces: `/:file{.:ext}` not `/:file.:ext?`
- **Removed methods**: `app.del()` → `app.delete()`, `res.sendfile()` → `res.sendFile()`
- **req.body**: Returns `undefined` (not `{}`) when unparsed
- **req.query**: No longer writable, uses "simple" parser by default

See `references/guide/migration-v5.md` for complete migration guide.

## Reference Documentation Structure

```
references/
├── api/
│   └── api-reference.md      # Complete API: express(), app, req, res, router
├── guide/
│   ├── routing.md            # Route methods, paths, parameters, handlers
│   ├── middleware.md         # Writing and using middleware
│   ├── error-handling.md     # Error catching and custom handlers
│   └── migration-v5.md       # Express 4 to 5 migration guide
├── advanced/
│   ├── security.md           # Security best practices (Helmet, TLS, cookies)
│   └── performance.md        # Performance optimization and deployment
└── getting-started/
    └── quickstart.md         # Installation, hello world, project setup
```

## Core Concepts

### Application Object (`app`)

The `app` object represents the Express application:

```javascript
const app = express()

// Settings
app.set('view engine', 'pug')
app.set('trust proxy', true)
app.enable('case sensitive routing')

// Mounting middleware and routes
app.use(middleware)
app.use('/api', apiRouter)

// HTTP methods
app.get('/path', handler)
app.post('/path', handler)
app.put('/path', handler)
app.delete('/path', handler)
app.all('/path', handler)  // All methods
```

### Request Object (`req`)

Key properties and methods:

| Property | Description |
|----------|-------------|
| `req.params` | Route parameters (e.g., `/users/:id` → `req.params.id`) |
| `req.query` | Query string parameters |
| `req.body` | Parsed request body (requires body-parsing middleware) |
| `req.headers` | Request headers |
| `req.method` | HTTP method |
| `req.path` | Request path |
| `req.ip` | Client IP address |
| `req.cookies` | Cookies (requires cookie-parser) |

### Response Object (`res`)

Key methods:

| Method | Description |
|--------|-------------|
| `res.send(body)` | Send response (auto content-type) |
| `res.json(obj)` | Send JSON response |
| `res.status(code)` | Set status code (chainable) |
| `res.redirect([status,] path)` | Redirect request |
| `res.render(view, locals)` | Render template |
| `res.sendFile(path)` | Send file |
| `res.download(path)` | Prompt file download |
| `res.set(header, value)` | Set response header |
| `res.cookie(name, value)` | Set cookie |

### Router

Create modular route handlers:

```javascript
const router = express.Router()

router.use(authMiddleware)  // Router-specific middleware

router.get('/', listUsers)
router.get('/:id', getUser)
router.post('/', createUser)
router.put('/:id', updateUser)
router.delete('/:id', deleteUser)

// Mount in app
app.use('/users', router)
```

## Common Patterns

### Middleware Chain

```javascript
// Logging → Auth → Route Handler → Error Handler
app.use(morgan('combined'))
app.use(authMiddleware)
app.use('/api', apiRoutes)
app.use(errorHandler)  // Must be last, has 4 params: (err, req, res, next)
```

### Error Handling (Express 5)

```javascript
// Async errors are caught automatically in Express 5
app.get('/user/:id', async (req, res) => {
  const user = await User.findById(req.params.id)  // Errors auto-forwarded
  if (!user) {
    const err = new Error('User not found')
    err.status = 404
    throw err
  }
  res.json(user)
})

// Error handler middleware (4 arguments required)
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  })
})
```

### RESTful API Structure

```javascript
const express = require('express')
const app = express()

app.use(express.json())

// Routes
const usersRouter = require('./routes/users')
const postsRouter = require('./routes/posts')

app.use('/api/users', usersRouter)
app.use('/api/posts', postsRouter)

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message })
})
```

### Static Files with Virtual Path

```javascript
// Serve ./public at /static
app.use('/static', express.static('public', {
  maxAge: '1d',
  etag: true,
  index: 'index.html'
}))
```

## When to Read Reference Files

| Task | Reference File |
|------|----------------|
| Look up specific API method | `references/api/api-reference.md` |
| Implement routing patterns | `references/guide/routing.md` |
| Create custom middleware | `references/guide/middleware.md` |
| Handle errors properly | `references/guide/error-handling.md` |
| Migrate from Express 4 | `references/guide/migration-v5.md` |
| Security hardening | `references/advanced/security.md` |
| Performance optimization | `references/advanced/performance.md` |
| Set up new project | `references/getting-started/quickstart.md` |

## Production Checklist

1. **Security**: Use Helmet, set secure cookies, validate input
2. **Performance**: Enable gzip, use clustering, cache responses
3. **Environment**: Set `NODE_ENV=production`
4. **Error handling**: Never expose stack traces in production
5. **Logging**: Use async logger (Pino), not console.log
6. **Process management**: Use systemd or PM2
7. **Reverse proxy**: Run behind Nginx/HAProxy for TLS and load balancing

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `helmet` | Security headers |
| `cors` | CORS handling |
| `morgan` | HTTP request logging |
| `compression` | Gzip compression |
| `cookie-parser` | Cookie parsing |
| `express-session` | Session management |
| `express-validator` | Input validation |
| `multer` | File uploads |
