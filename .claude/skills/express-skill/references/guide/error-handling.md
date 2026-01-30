# Express Error Handling Guide

Error handling refers to how Express catches and processes errors that occur both synchronously and asynchronously.

## Catching Errors

### Synchronous Errors

Errors in synchronous code are caught automatically:

```javascript
app.get('/', (req, res) => {
  throw new Error('BROKEN') // Express will catch this
})
```

### Asynchronous Errors (Callback-Style)

Pass errors to `next()` for Express to catch and process:

```javascript
app.get('/', (req, res, next) => {
  fs.readFile('/file-does-not-exist', (err, data) => {
    if (err) {
      next(err) // Pass errors to Express
    } else {
      res.send(data)
    }
  })
})
```

### Asynchronous Errors (Express 5 - Promises)

**Express 5 automatically handles rejected promises**:

```javascript
app.get('/user/:id', async (req, res, next) => {
  const user = await getUserById(req.params.id)
  res.send(user)
})
// If getUserById rejects, next(err) is called automatically
```

### The next() Function

- `next()` - Pass control to next middleware
- `next('route')` - Skip to next route handler
- `next(err)` - Skip to error-handling middleware
- `next('router')` - Exit the router

Passing anything to `next()` except `'route'` or `'router'` triggers error handling:

```javascript
app.get('/', (req, res, next) => {
  next(new Error('Something went wrong'))
})
```

### Simplified Error Passing

When the callback only handles errors:

```javascript
app.get('/', [
  function (req, res, next) {
    fs.writeFile('/inaccessible-path', 'data', next)
  },
  function (req, res) {
    res.send('OK')
  }
])
```

### Catching Async Errors in setTimeout/setInterval

You must use try-catch for errors in async operations:

```javascript
app.get('/', (req, res, next) => {
  setTimeout(() => {
    try {
      throw new Error('BROKEN')
    } catch (err) {
      next(err)
    }
  }, 100)
})
```

### Using Promises

Promises automatically catch both sync errors and rejections:

```javascript
app.get('/', (req, res, next) => {
  Promise.resolve()
    .then(() => {
      throw new Error('BROKEN')
    })
    .catch(next) // Pass to Express error handler
})
```

### Chained Error Handling

```javascript
app.get('/', [
  function (req, res, next) {
    fs.readFile('/maybe-valid-file', 'utf-8', (err, data) => {
      res.locals.data = data
      next(err)
    })
  },
  function (req, res) {
    res.locals.data = res.locals.data.split(',')[1]
    res.send(res.locals.data)
  }
])
```

## The Default Error Handler

Express has a built-in error handler at the end of the middleware stack:

- Writes error to client with stack trace (development only)
- Sets `res.statusCode` from `err.status` or `err.statusCode`
- Sets `res.statusMessage` according to status code
- In production, only sends status code message (no stack trace)

### Setting Production Mode

```bash
NODE_ENV=production node app.js
```

### Error Response Details

When an error is passed to `next()`:

```javascript
const err = new Error('Not Found')
err.status = 404
err.headers = { 'X-Custom-Header': 'value' }
next(err)
```

- `err.status` / `err.statusCode` → Response status code (defaults to 500)
- `err.headers` → Additional response headers
- `err.stack` → Stack trace (development only)

### Delegating to Default Handler

If headers are already sent, delegate to the default handler:

```javascript
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }
  res.status(500)
  res.render('error', { error: err })
}
```

## Writing Error Handlers

Error-handling middleware has **four arguments**:

```javascript
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).send('Something broke!')
})
```

### Placement

Define error handlers **last**, after other `app.use()` and routes:

```javascript
const bodyParser = require('body-parser')
const methodOverride = require('method-override')

app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(methodOverride())

// Routes
app.use('/api', apiRoutes)

// Error handler - MUST be last
app.use((err, req, res, next) => {
  // error handling logic
})
```

### Multiple Error Handlers

Chain multiple error handlers for different purposes:

```javascript
app.use(logErrors)
app.use(clientErrorHandler)
app.use(errorHandler)
```

#### Log Errors

```javascript
function logErrors(err, req, res, next) {
  console.error(err.stack)
  next(err)
}
```

#### Handle XHR Errors

```javascript
function clientErrorHandler(err, req, res, next) {
  if (req.xhr) {
    res.status(500).send({ error: 'Something failed!' })
  } else {
    next(err)
  }
}
```

#### Catch-All Error Handler

```javascript
function errorHandler(err, req, res, next) {
  res.status(500)
  res.render('error', { error: err })
}
```

**Important**: When not calling `next()` in an error handler, you must write and end the response.

## Common Error Handling Patterns

### Custom Error Classes

```javascript
class AppError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error'
    this.isOperational = true

    Error.captureStackTrace(this, this.constructor)
  }
}

// Usage
app.get('/user/:id', async (req, res, next) => {
  const user = await User.findById(req.params.id)
  if (!user) {
    return next(new AppError('User not found', 404))
  }
  res.json(user)
})
```

### 404 Handler

Add after all routes:

```javascript
app.use((req, res, next) => {
  res.status(404).send("Sorry, can't find that!")
})
```

Or throw an error:

```javascript
app.use((req, res, next) => {
  const err = new Error('Not Found')
  err.status = 404
  next(err)
})
```

### JSON API Error Handler

```javascript
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal Server Error'
  
  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  })
})
```

### Environment-Specific Errors

```javascript
app.use((err, req, res, next) => {
  res.status(err.status || 500)
  
  if (process.env.NODE_ENV === 'production') {
    // Production: minimal info
    res.json({
      message: err.isOperational ? err.message : 'Something went wrong'
    })
  } else {
    // Development: full details
    res.json({
      message: err.message,
      stack: err.stack,
      error: err
    })
  }
})
```

### Async Handler Wrapper

For Express 4 (Express 5 handles this automatically):

```javascript
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

// Usage
app.get('/user/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
  if (!user) throw new AppError('User not found', 404)
  res.json(user)
}))
```

## Express 5 Async Error Handling

Express 5 automatically catches rejected promises:

```javascript
// This works in Express 5 without wrapper
app.get('/user/:id', async (req, res) => {
  const user = await User.findById(req.params.id)
  if (!user) {
    const err = new Error('User not found')
    err.status = 404
    throw err  // Automatically caught and passed to error handler
  }
  res.json(user)
})
```

## What NOT to Do

### Don't Listen for uncaughtException

```javascript
// BAD - Don't do this
process.on('uncaughtException', (err) => {
  console.log('Caught exception:', err)
  // App continues running in unreliable state
})
```

This keeps the app running in an unpredictable state. Let it crash and use a process manager to restart.

### Don't Use Domains

The `domain` module is deprecated and doesn't solve the problem properly.

## Best Practices

1. **Use try-catch for sync code** in route handlers
2. **Use promises** and let Express 5 catch rejections
3. **Create custom error classes** for operational errors
4. **Log errors** before responding
5. **Never expose stack traces** in production
6. **Use process managers** (PM2, systemd) for restarts
7. **Define error handlers last** in middleware stack
8. **Always provide 4 arguments** to error handler
9. **Delegate to default handler** if headers sent
10. **Handle 404s explicitly** as the last non-error middleware

## Error Handler Template

```javascript
// Custom error class
class AppError extends Error {
  constructor(message, statusCode) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = true
    Error.captureStackTrace(this, this.constructor)
  }
}

// 404 handler
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl}`, 404))
})

// Global error handler
app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500
  
  // Log error
  console.error('ERROR:', err)
  
  // Send response
  if (process.env.NODE_ENV === 'production') {
    // Production: operational errors only
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: 'error',
        message: err.message
      })
    } else {
      // Programming error: don't leak details
      res.status(500).json({
        status: 'error',
        message: 'Something went wrong'
      })
    }
  } else {
    // Development: full details
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      stack: err.stack,
      error: err
    })
  }
})

module.exports = { AppError }
```
