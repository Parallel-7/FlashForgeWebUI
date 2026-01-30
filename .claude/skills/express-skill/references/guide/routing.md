# Express Routing Guide

Routing refers to how an application's endpoints (URIs) respond to client requests.

## Basic Routing

Define routes using methods of the Express app object that correspond to HTTP methods:

```javascript
const express = require('express')
const app = express()

// respond with "hello world" when a GET request is made to the homepage
app.get('/', (req, res) => {
  res.send('hello world')
})
```

## Route Methods

Route methods are derived from HTTP methods and attached to the express instance:

```javascript
// GET method route
app.get('/', (req, res) => {
  res.send('GET request to the homepage')
})

// POST method route
app.post('/', (req, res) => {
  res.send('POST request to the homepage')
})
```

Express supports all HTTP request methods: `get`, `post`, `put`, `delete`, `patch`, `options`, `head`, and more.

### app.all() - Match All Methods

Use `app.all()` to load middleware for all HTTP methods at a path:

```javascript
app.all('/secret', (req, res, next) => {
  console.log('Accessing the secret section...')
  next() // pass control to the next handler
})
```

## Route Paths

Route paths define endpoints where requests can be made. They can be strings, string patterns, or regular expressions.

### String Paths

```javascript
// Matches root route /
app.get('/', (req, res) => res.send('root'))

// Matches /about
app.get('/about', (req, res) => res.send('about'))

// Matches /random.text
app.get('/random.text', (req, res) => res.send('random.text'))
```

### Regular Expression Paths

```javascript
// Matches anything with an "a" in it
app.get(/a/, (req, res) => res.send('/a/'))

// Matches butterfly and dragonfly, but not butterflyman
app.get(/.*fly$/, (req, res) => res.send('/.*fly$/'))
```

### Express 5 Path Syntax Changes

**Important**: Express 5 uses different path syntax than Express 4.

#### Wildcards Must Be Named

```javascript
// Express 4 (deprecated)
app.get('/*', handler)

// Express 5 - wildcards must have names
app.get('/*splat', handler)

// To also match the root path, wrap in braces
app.get('/{*splat}', handler)  // Matches /, /foo, /foo/bar
```

#### Optional Parameters Use Braces

```javascript
// Express 4 (deprecated)
app.get('/:file.:ext?', handler)

// Express 5
app.get('/:file{.:ext}', handler)
```

#### No Regexp Characters in Paths

```javascript
// Express 4 (deprecated)
app.get('/[discussion|page]/:slug', handler)

// Express 5 - use arrays instead
app.get(['/discussion/:slug', '/page/:slug'], handler)
```

## Route Parameters

Route parameters are named URL segments that capture values at their position in the URL:

```javascript
// Route path: /users/:userId/books/:bookId
// Request URL: http://localhost:3000/users/34/books/8989
// req.params: { "userId": "34", "bookId": "8989" }

app.get('/users/:userId/books/:bookId', (req, res) => {
  res.send(req.params)
})
```

### Parameter Names

Parameter names must be "word characters" `[A-Za-z0-9_]`.

Hyphens and dots are interpreted literally, so they can be used:

```javascript
// Route path: /flights/:from-:to
// Request URL: /flights/LAX-SFO
// req.params: { "from": "LAX", "to": "SFO" }

// Route path: /plantae/:genus.:species
// Request URL: /plantae/Prunus.persica
// req.params: { "genus": "Prunus", "species": "persica" }
```

### Parameter Constraints (Regular Expressions)

Append a regular expression in parentheses:

```javascript
// Route path: /user/:userId(\d+)
// Only matches numeric user IDs
// Request URL: /user/42
// req.params: { "userId": "42" }

app.get('/user/:userId(\\d+)', (req, res) => {
  res.send(req.params)
})
```

**Note**: Escape backslashes in the regex string: `\\d+`

### Express 5 Parameter Behavior

Wildcard parameters are now arrays:

```javascript
app.get('/*splat', (req, res) => {
  // GET /foo/bar
  console.log(req.params.splat)  // ['foo', 'bar']
})
```

Unmatched optional parameters are omitted (not `undefined`):

```javascript
app.get('/:file{.:ext}', (req, res) => {
  // GET /image
  console.log(req.params)  // { file: 'image' } - no ext key
})
```

## Route Handlers

You can provide multiple callback functions that behave like middleware:

### Single Callback

```javascript
app.get('/example/a', (req, res) => {
  res.send('Hello from A!')
})
```

### Multiple Callbacks

```javascript
app.get('/example/b', (req, res, next) => {
  console.log('the response will be sent by the next function...')
  next()
}, (req, res) => {
  res.send('Hello from B!')
})
```

### Array of Callbacks

```javascript
const cb0 = (req, res, next) => {
  console.log('CB0')
  next()
}

const cb1 = (req, res, next) => {
  console.log('CB1')
  next()
}

const cb2 = (req, res) => {
  res.send('Hello from C!')
}

app.get('/example/c', [cb0, cb1, cb2])
```

### Combination of Functions and Arrays

```javascript
app.get('/example/d', [cb0, cb1], (req, res, next) => {
  console.log('the response will be sent by the next function...')
  next()
}, (req, res) => {
  res.send('Hello from D!')
})
```

### Using next('route')

Skip to the next route by calling `next('route')`:

```javascript
app.get('/user/:id', (req, res, next) => {
  // if the user ID is 0, skip to the next route
  if (req.params.id === '0') next('route')
  // otherwise pass the control to the next middleware
  else next()
}, (req, res) => {
  // send a regular response
  res.send('regular')
})

// handler for the /user/:id path, which sends a special response
app.get('/user/:id', (req, res) => {
  res.send('special')
})
```

Result:
- `GET /user/5` → "regular"
- `GET /user/0` → "special" (first route calls `next('route')`)

## Response Methods

Methods on the response object that send a response and terminate the request-response cycle:

| Method | Description |
|--------|-------------|
| `res.download()` | Prompt a file to be downloaded |
| `res.end()` | End the response process |
| `res.json()` | Send a JSON response |
| `res.jsonp()` | Send a JSON response with JSONP support |
| `res.redirect()` | Redirect a request |
| `res.render()` | Render a view template |
| `res.send()` | Send a response of various types |
| `res.sendFile()` | Send a file as an octet stream |
| `res.sendStatus()` | Set status code and send its string representation |

**Important**: If none of these methods are called, the client request will be left hanging.

## app.route()

Create chainable route handlers for a route path:

```javascript
app.route('/book')
  .get((req, res) => {
    res.send('Get a random book')
  })
  .post((req, res) => {
    res.send('Add a book')
  })
  .put((req, res) => {
    res.send('Update the book')
  })
```

## express.Router

Create modular, mountable route handlers. A Router instance is a complete middleware and routing system (often called a "mini-app").

### Creating a Router Module

Create `birds.js`:

```javascript
const express = require('express')
const router = express.Router()

// middleware specific to this router
const timeLog = (req, res, next) => {
  console.log('Time:', Date.now())
  next()
}
router.use(timeLog)

// define the home page route
router.get('/', (req, res) => {
  res.send('Birds home page')
})

// define the about route
router.get('/about', (req, res) => {
  res.send('About birds')
})

module.exports = router
```

### Mounting the Router

```javascript
const birds = require('./birds')

// ...

app.use('/birds', birds)
```

The app now handles requests to `/birds` and `/birds/about`.

### mergeParams Option

If the parent route has path parameters, make them accessible in sub-routes:

```javascript
const router = express.Router({ mergeParams: true })
```

## Route Organization Patterns

### By Resource (RESTful)

```
routes/
├── users.js     # /api/users routes
├── posts.js     # /api/posts routes
├── comments.js  # /api/comments routes
└── index.js     # Mount all routes
```

```javascript
// routes/users.js
const router = require('express').Router()

router.get('/', listUsers)
router.get('/:id', getUser)
router.post('/', createUser)
router.put('/:id', updateUser)
router.delete('/:id', deleteUser)

module.exports = router

// routes/index.js
const router = require('express').Router()

router.use('/users', require('./users'))
router.use('/posts', require('./posts'))
router.use('/comments', require('./comments'))

module.exports = router

// app.js
app.use('/api', require('./routes'))
```

### By Feature/Module

```
modules/
├── auth/
│   ├── routes.js
│   ├── controller.js
│   └── middleware.js
├── users/
│   ├── routes.js
│   ├── controller.js
│   └── model.js
└── posts/
    ├── routes.js
    ├── controller.js
    └── model.js
```

## Common Routing Patterns

### API Versioning

```javascript
const v1Router = express.Router()
const v2Router = express.Router()

v1Router.get('/users', v1ListUsers)
v2Router.get('/users', v2ListUsers)

app.use('/api/v1', v1Router)
app.use('/api/v2', v2Router)
```

### Nested Resources

```javascript
// /users/:userId/posts/:postId
const postsRouter = express.Router({ mergeParams: true })

postsRouter.get('/', (req, res) => {
  // req.params.userId available from parent
  res.send(`Posts for user ${req.params.userId}`)
})

postsRouter.get('/:postId', (req, res) => {
  res.send(`Post ${req.params.postId} for user ${req.params.userId}`)
})

app.use('/users/:userId/posts', postsRouter)
```

### 404 Handler

Add at the end of all routes:

```javascript
// After all other routes
app.use((req, res) => {
  res.status(404).send("Sorry, can't find that!")
})
```
