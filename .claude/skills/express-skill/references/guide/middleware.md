# Express Middleware Guide

Express is essentially a series of middleware function calls. Middleware functions have access to the request object (`req`), response object (`res`), and the next middleware function (`next`).

## What Middleware Can Do

- Execute any code
- Make changes to request and response objects
- End the request-response cycle
- Call the next middleware function in the stack

**Important**: If a middleware function does not end the request-response cycle, it must call `next()` to pass control to the next function. Otherwise, the request will hang.

## Types of Middleware

1. Application-level middleware
2. Router-level middleware
3. Error-handling middleware
4. Built-in middleware
5. Third-party middleware

## Application-Level Middleware

Bind to the app object using `app.use()` and `app.METHOD()`:

### Middleware with No Mount Path

Executed for every request:

```javascript
const express = require('express')
const app = express()

app.use((req, res, next) => {
  console.log('Time:', Date.now())
  next()
})
```

### Middleware Mounted on a Path

Executed for any request to `/user/:id`:

```javascript
app.use('/user/:id', (req, res, next) => {
  console.log('Request Type:', req.method)
  next()
})
```

### Route Handler (Middleware System)

```javascript
app.get('/user/:id', (req, res, next) => {
  res.send('USER')
})
```

### Multiple Middleware Functions

Loading a series of middleware at a mount point:

```javascript
app.use('/user/:id', (req, res, next) => {
  console.log('Request URL:', req.originalUrl)
  next()
}, (req, res, next) => {
  console.log('Request Type:', req.method)
  next()
})
```

### Middleware Sub-Stack

```javascript
app.get('/user/:id', (req, res, next) => {
  console.log('ID:', req.params.id)
  next()
}, (req, res, next) => {
  res.send('User Info')
})

// This second handler for the same path will never be called
// because the first one ends the request-response cycle
app.get('/user/:id', (req, res, next) => {
  res.send(req.params.id)
})
```

### Skipping Middleware with next('route')

Skip remaining middleware in the current route:

```javascript
app.get('/user/:id', (req, res, next) => {
  // if user ID is 0, skip to next route
  if (req.params.id === '0') next('route')
  else next()
}, (req, res, next) => {
  // render a regular page
  res.send('regular')
})

// handler for the /user/:id path
app.get('/user/:id', (req, res, next) => {
  res.send('special')
})
```

**Note**: `next('route')` only works with `app.METHOD()` or `router.METHOD()` functions.

### Reusable Middleware Array

```javascript
function logOriginalUrl(req, res, next) {
  console.log('Request URL:', req.originalUrl)
  next()
}

function logMethod(req, res, next) {
  console.log('Request Type:', req.method)
  next()
}

const logStuff = [logOriginalUrl, logMethod]

app.get('/user/:id', logStuff, (req, res, next) => {
  res.send('User Info')
})
```

## Router-Level Middleware

Works the same as application-level middleware, but bound to `express.Router()`:

```javascript
const express = require('express')
const app = express()
const router = express.Router()

// Middleware with no mount path - runs for every request to router
router.use((req, res, next) => {
  console.log('Time:', Date.now())
  next()
})

// Middleware sub-stack for /user/:id
router.use('/user/:id', (req, res, next) => {
  console.log('Request URL:', req.originalUrl)
  next()
}, (req, res, next) => {
  console.log('Request Type:', req.method)
  next()
})

// Route handler
router.get('/user/:id', (req, res, next) => {
  if (req.params.id === '0') next('route')
  else next()
}, (req, res, next) => {
  res.render('regular')
})

router.get('/user/:id', (req, res, next) => {
  console.log(req.params.id)
  res.render('special')
})

// Mount the router
app.use('/', router)
```

### Skipping Router with next('router')

Skip out of the router instance entirely:

```javascript
const router = express.Router()

// Predicate router with a check
router.use((req, res, next) => {
  if (!req.headers['x-auth']) return next('router')
  next()
})

router.get('/user/:id', (req, res) => {
  res.send('hello, user!')
})

// Use the router and 401 anything falling through
app.use('/admin', router, (req, res) => {
  res.sendStatus(401)
})
```

## Error-Handling Middleware

**Error-handling middleware always takes four arguments**. You must provide all four to identify it as error-handling middleware:

```javascript
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).send('Something broke!')
})
```

Define error-handling middleware **last**, after other `app.use()` and routes:

```javascript
const bodyParser = require('body-parser')
const methodOverride = require('method-override')

app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(methodOverride())
app.use((err, req, res, next) => {
  // error handling logic
})
```

### Multiple Error Handlers

```javascript
app.use(logErrors)
app.use(clientErrorHandler)
app.use(errorHandler)

function logErrors(err, req, res, next) {
  console.error(err.stack)
  next(err)
}

function clientErrorHandler(err, req, res, next) {
  if (req.xhr) {
    res.status(500).send({ error: 'Something failed!' })
  } else {
    next(err)
  }
}

function errorHandler(err, req, res, next) {
  res.status(500)
  res.render('error', { error: err })
}
```

**Important**: When not calling `next()` in an error handler, you are responsible for writing and ending the response.

## Built-in Middleware

Starting with Express 4.x, Express no longer depends on Connect. Built-in middleware:

| Middleware | Description |
|------------|-------------|
| `express.static` | Serves static assets (HTML, images, etc.) |
| `express.json` | Parses incoming JSON payloads (Express 4.16.0+) |
| `express.urlencoded` | Parses URL-encoded payloads (Express 4.16.0+) |

```javascript
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))
```

## Third-Party Middleware

Install and load third-party middleware:

```bash
npm install cookie-parser
```

```javascript
const express = require('express')
const app = express()
const cookieParser = require('cookie-parser')

// Load the cookie-parsing middleware
app.use(cookieParser())
```

### Common Third-Party Middleware

| Package | Purpose |
|---------|---------|
| `helmet` | Security headers |
| `cors` | CORS handling |
| `morgan` | HTTP request logging |
| `compression` | Response compression |
| `cookie-parser` | Cookie parsing |
| `express-session` | Session management |
| `passport` | Authentication |
| `multer` | Multipart/form-data (file uploads) |
| `express-validator` | Input validation |
| `express-rate-limit` | Rate limiting |

## Writing Custom Middleware

### Basic Middleware Function

```javascript
const myLogger = (req, res, next) => {
  console.log('LOGGED')
  next()
}

app.use(myLogger)
```

### Middleware with Configuration

```javascript
function requestTime(options = {}) {
  return (req, res, next) => {
    req.requestTime = Date.now()
    if (options.log) {
      console.log(`Request time: ${req.requestTime}`)
    }
    next()
  }
}

app.use(requestTime({ log: true }))

app.get('/', (req, res) => {
  res.send(`Request received at: ${req.requestTime}`)
})
```

### Async Middleware (Express 5)

In Express 5, rejected promises are automatically handled:

```javascript
app.use(async (req, res, next) => {
  req.user = await getUser(req)
  next() // Called if promise doesn't reject
})
```

### Async Middleware with Validation

```javascript
const cookieParser = require('cookie-parser')
const cookieValidator = require('./cookieValidator')

async function validateCookies(req, res, next) {
  await cookieValidator(req.cookies)
  next()
}

app.use(cookieParser())
app.use(validateCookies)

// Error handler
app.use((err, req, res, next) => {
  res.status(400).send(err.message)
})
```

## Middleware Order

**Order matters!** Middleware is executed sequentially:

```javascript
// Logger runs first
app.use(morgan('combined'))

// Then body parsing
app.use(express.json())

// Then authentication
app.use(authMiddleware)

// Then routes
app.use('/api', apiRoutes)

// 404 handler (must be after all routes)
app.use((req, res, next) => {
  res.status(404).send('Not Found')
})

// Error handler (must be last)
app.use((err, req, res, next) => {
  res.status(500).send('Server Error')
})
```

### Static Files Before Logger

To skip logging for static files:

```javascript
// Static files served first, no logging
app.use(express.static('public'))

// Logger only for non-static requests
app.use(morgan('combined'))
```

## Conditional Middleware

### Skip Middleware for Certain Paths

```javascript
app.use((req, res, next) => {
  if (req.path.startsWith('/public')) {
    return next()
  }
  // Do middleware logic
  next()
})
```

### Environment-Based Middleware

```javascript
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'))
}

if (process.env.NODE_ENV === 'production') {
  app.use(compression())
}
```

## Middleware Best Practices

1. **Always call `next()`** unless you're ending the response
2. **Define error handlers last** with all 4 parameters
3. **Keep middleware focused** - single responsibility
4. **Handle async errors** - catch and pass to `next(err)`
5. **Order matters** - place middleware in logical sequence
6. **Use `next('route')`** to skip to next route handler
7. **Use `next('router')`** to exit router entirely
8. **Avoid blocking operations** - use async/await
9. **Validate input early** - before business logic
10. **Log errors** before passing to error handler
