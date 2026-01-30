# Express 5.x API Reference

Complete API documentation for Express.js 5.x. Express 5.0 requires Node.js 18 or higher.

## express()

Creates an Express application - the top-level function exported by the express module.

```javascript
const express = require('express')
const app = express()
```

### Built-in Middleware

#### express.json([options])

Parses incoming requests with JSON payloads. Returns middleware that only parses JSON where `Content-Type` matches the `type` option.

```javascript
app.use(express.json())
app.use(express.json({ limit: '10mb', strict: true }))
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `inflate` | Boolean | `true` | Handle deflated (compressed) bodies |
| `limit` | Mixed | `"100kb"` | Max request body size |
| `reviver` | Function | `null` | Passed to `JSON.parse` as reviver |
| `strict` | Boolean | `true` | Only accept arrays and objects |
| `type` | Mixed | `"application/json"` | Media type to parse |
| `verify` | Function | `undefined` | Function to verify raw body |

#### express.urlencoded([options])

Parses incoming requests with URL-encoded payloads.

```javascript
app.use(express.urlencoded({ extended: true }))
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `extended` | Boolean | `false` | Use `qs` library (true) or `querystring` (false) |
| `inflate` | Boolean | `true` | Handle deflated bodies |
| `limit` | Mixed | `"100kb"` | Max request body size |
| `parameterLimit` | Number | `1000` | Max number of parameters |
| `type` | Mixed | `"application/x-www-form-urlencoded"` | Media type to parse |
| `depth` | Number | `32` | Max depth for `qs` library parsing |

#### express.static(root, [options])

Serves static files from the given root directory.

```javascript
app.use(express.static('public'))
app.use('/static', express.static('files', { maxAge: '1d' }))
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dotfiles` | String | `"ignore"` | How to treat dotfiles: "allow", "deny", "ignore" |
| `etag` | Boolean | `true` | Enable ETag generation |
| `extensions` | Mixed | `false` | File extension fallbacks, e.g., `['html', 'htm']` |
| `fallthrough` | Boolean | `true` | Let client errors fall-through |
| `immutable` | Boolean | `false` | Enable immutable directive in Cache-Control |
| `index` | Mixed | `"index.html"` | Directory index file |
| `lastModified` | Boolean | `true` | Set Last-Modified header |
| `maxAge` | Number | `0` | Max-age for Cache-Control in ms |
| `redirect` | Boolean | `true` | Redirect to trailing "/" for directories |

**Express 5 Change**: `dotfiles` now defaults to `"ignore"` (was served by default in v4).

#### express.Router([options])

Creates a new router object.

```javascript
const router = express.Router()
const router = express.Router({ caseSensitive: true, mergeParams: true })
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `caseSensitive` | Boolean | `false` | Enable case sensitivity |
| `mergeParams` | Boolean | `false` | Preserve parent's req.params |
| `strict` | Boolean | `false` | Enable strict routing ("/foo" ≠ "/foo/") |

#### express.raw([options])

Parses incoming request payloads into a Buffer.

```javascript
app.use(express.raw({ type: 'application/octet-stream' }))
```

#### express.text([options])

Parses incoming request payloads into a string.

```javascript
app.use(express.text({ type: 'text/plain' }))
```

---

## Application (app)

The app object represents the Express application.

### Properties

#### app.locals

Local variables available in templates rendered with `res.render()`. Persists throughout app lifetime.

```javascript
app.locals.title = 'My App'
app.locals.email = 'admin@example.com'
```

#### app.mountpath

Path patterns on which a sub-app was mounted.

```javascript
const admin = express()
admin.get('/', (req, res) => {
  console.log(admin.mountpath) // '/admin'
})
app.use('/admin', admin)
```

#### app.router

The application's built-in router instance.

```javascript
const router = app.router
router.get('/', handler)
```

### Events

#### app.on('mount', callback)

Fired when a sub-app is mounted on a parent app.

```javascript
const admin = express()
admin.on('mount', (parent) => {
  console.log('Admin mounted on parent')
})
app.use('/admin', admin)
```

### Methods

#### app.all(path, callback [, callback ...])

Matches all HTTP methods for a path.

```javascript
app.all('/secret', (req, res, next) => {
  console.log('Accessing the secret section...')
  next()
})
```

#### app.delete(path, callback [, callback ...])

Routes HTTP DELETE requests.

```javascript
app.delete('/user/:id', (req, res) => {
  res.send(`DELETE user ${req.params.id}`)
})
```

#### app.disable(name) / app.enable(name)

Sets boolean settings to false/true.

```javascript
app.disable('x-powered-by')
app.enable('trust proxy')
```

#### app.disabled(name) / app.enabled(name)

Returns true if setting is disabled/enabled.

```javascript
app.disabled('trust proxy') // true
app.enable('trust proxy')
app.enabled('trust proxy')  // true
```

#### app.engine(ext, callback)

Registers a template engine.

```javascript
app.engine('html', require('ejs').renderFile)
app.engine('pug', require('pug').__express)
```

#### app.get(name)

Returns the value of an app setting.

```javascript
app.set('title', 'My Site')
app.get('title') // "My Site"
```

#### app.get(path, callback [, callback ...])

Routes HTTP GET requests.

```javascript
app.get('/', (req, res) => {
  res.send('GET request to homepage')
})
```

#### app.listen([port[, host[, backlog]]][, callback])

Binds and listens for connections.

```javascript
app.listen(3000)
app.listen(3000, () => console.log('Server running'))
app.listen(3000, '0.0.0.0', () => console.log('Listening on all interfaces'))
```

**Express 5 Change**: Errors are now passed to callback instead of thrown.

```javascript
app.listen(3000, (error) => {
  if (error) throw error  // e.g., EADDRINUSE
  console.log('Listening on port 3000')
})
```

#### app.METHOD(path, callback [, callback ...])

Routes HTTP requests where METHOD is the HTTP method (get, post, put, delete, etc.).

Supported methods: `checkout`, `copy`, `delete`, `get`, `head`, `lock`, `merge`, `mkactivity`, `mkcol`, `move`, `m-search`, `notify`, `options`, `patch`, `post`, `purge`, `put`, `report`, `search`, `subscribe`, `trace`, `unlock`, `unsubscribe`

#### app.param(name, callback)

Add callback triggers to route parameters.

```javascript
app.param('user', (req, res, next, id) => {
  User.find(id, (err, user) => {
    if (err) return next(err)
    if (!user) return next(new Error('User not found'))
    req.user = user
    next()
  })
})

app.get('/user/:user', (req, res) => {
  res.send(req.user)
})
```

#### app.path()

Returns the canonical path of the app.

```javascript
const blog = express()
app.use('/blog', blog)
blog.path() // '/blog'
```

#### app.post(path, callback [, callback ...])

Routes HTTP POST requests.

```javascript
app.post('/user', (req, res) => {
  res.send('POST request to /user')
})
```

#### app.put(path, callback [, callback ...])

Routes HTTP PUT requests.

```javascript
app.put('/user/:id', (req, res) => {
  res.send(`PUT user ${req.params.id}`)
})
```

#### app.render(view, [locals], callback)

Returns rendered HTML of a view via callback.

```javascript
app.render('email', { name: 'Tobi' }, (err, html) => {
  if (err) return console.error(err)
  // html contains rendered template
})
```

#### app.route(path)

Returns a single route for chaining HTTP method handlers.

```javascript
app.route('/book')
  .get((req, res) => res.send('Get a book'))
  .post((req, res) => res.send('Add a book'))
  .put((req, res) => res.send('Update the book'))
  .delete((req, res) => res.send('Delete the book'))
```

#### app.set(name, value)

Assigns setting name to value.

```javascript
app.set('title', 'My Site')
app.set('views', './views')
app.set('view engine', 'pug')
```

### Application Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `case sensitive routing` | Boolean | `undefined` | "/Foo" and "/foo" are different |
| `env` | String | `NODE_ENV` or "development" | Environment mode |
| `etag` | Varied | `"weak"` | ETag response header |
| `jsonp callback name` | String | `"callback"` | JSONP callback name |
| `json escape` | Boolean | `undefined` | Escape `<`, `>`, `&` in JSON |
| `json replacer` | Varied | `undefined` | JSON.stringify replacer |
| `json spaces` | Varied | `undefined` | JSON.stringify spaces |
| `query parser` | Varied | `"simple"` | Query string parser |
| `strict routing` | Boolean | `undefined` | "/foo" and "/foo/" are different |
| `subdomain offset` | Number | `2` | Subdomain parts to remove |
| `trust proxy` | Varied | `false` | Trust X-Forwarded-* headers |
| `views` | String/Array | `./views` | View directories |
| `view cache` | Boolean | `true` in production | Cache view templates |
| `view engine` | String | `undefined` | Default template engine |
| `x-powered-by` | Boolean | `true` | Enable X-Powered-By header |

##### trust proxy Options

| Type | Value |
|------|-------|
| Boolean | `true`: trust all proxies; `false`: trust none |
| String | IP address or subnet to trust (e.g., `'loopback'`, `'10.0.0.0/8'`) |
| Number | Trust nth hop from front-facing proxy |
| Function | Custom trust function `(ip) => boolean` |

#### app.use([path,] callback [, callback...])

Mounts middleware at the specified path.

```javascript
// All requests
app.use((req, res, next) => {
  console.log('Time:', Date.now())
  next()
})

// Specific path
app.use('/api', apiRouter)

// Multiple middleware
app.use('/user/:id', authenticate, loadUser)
```

---

## Request (req)

The req object represents the HTTP request.

### Properties

#### req.app

Reference to the Express application.

```javascript
req.app.get('views')
```

#### req.baseUrl

The URL path on which a router was mounted.

```javascript
// Mounted at /greet
router.get('/jp', (req, res) => {
  console.log(req.baseUrl) // '/greet'
})
```

#### req.body

Contains parsed request body. Requires body-parsing middleware.

```javascript
// With express.json()
app.post('/user', (req, res) => {
  console.log(req.body.name)
})
```

**Express 5 Change**: Returns `undefined` when body not parsed (was `{}` in v4).

#### req.cookies

Contains cookies sent by the request. Requires cookie-parser middleware.

```javascript
// Cookie: name=tj
req.cookies.name // "tj"
```

#### req.fresh / req.stale

Indicates if response is still "fresh" in client's cache.

```javascript
if (req.fresh) {
  res.status(304).end()
}
```

#### req.host

Host derived from Host header (includes port in Express 5).

```javascript
// Host: "example.com:3000"
req.host // "example.com:3000"
```

#### req.hostname

Hostname derived from Host header.

```javascript
// Host: "example.com:3000"
req.hostname // "example.com"
```

#### req.ip

Remote IP address of the request.

```javascript
req.ip // "127.0.0.1"
```

#### req.ips

Array of IP addresses from X-Forwarded-For header (when trust proxy is set).

```javascript
// X-Forwarded-For: client, proxy1, proxy2
req.ips // ["client", "proxy1", "proxy2"]
```

#### req.method

HTTP method of the request.

```javascript
req.method // "GET", "POST", etc.
```

#### req.originalUrl

Original request URL (preserves full URL).

```javascript
// GET /search?q=something
req.originalUrl // "/search?q=something"
```

#### req.params

Object containing route parameters.

```javascript
// Route: /users/:userId/books/:bookId
// URL: /users/34/books/8989
req.params // { userId: "34", bookId: "8989" }
```

**Express 5 Change**: 
- Has null prototype when using string paths
- Wildcard params are arrays: `req.params.splat // ['foo', 'bar']`
- Unmatched optional params are omitted (not `undefined`)

#### req.path

Path part of the request URL.

```javascript
// example.com/users?sort=desc
req.path // "/users"
```

#### req.protocol

Request protocol string ("http" or "https").

```javascript
req.protocol // "https"
```

#### req.query

Object containing query string parameters.

```javascript
// GET /search?q=tobi+ferret
req.query.q // "tobi ferret"
```

**Express 5 Change**: No longer writable, default parser is "simple" (was "extended").

#### req.route

The currently matched route.

```javascript
app.get('/user/:id', (req, res) => {
  console.log(req.route)
})
```

#### req.secure

Boolean, true if TLS connection.

```javascript
req.secure // equivalent to req.protocol === 'https'
```

#### req.signedCookies

Contains signed cookies (requires cookie-parser).

```javascript
// Cookie: user=tobi.CP7AWaXDfAKIRfH49dQzKJx7sKzzSoPq7/AcBBRVwlI3
req.signedCookies.user // "tobi"
```

#### req.subdomains

Array of subdomains.

```javascript
// Host: "tobi.ferrets.example.com"
req.subdomains // ["ferrets", "tobi"]
```

#### req.xhr

Boolean, true if X-Requested-With header is "XMLHttpRequest".

```javascript
req.xhr // true for AJAX requests
```

### Methods

#### req.accepts(types)

Checks if content types are acceptable based on Accept header.

```javascript
// Accept: text/html
req.accepts('html')      // "html"
req.accepts('text/html') // "text/html"
req.accepts('json')      // false
```

#### req.acceptsCharsets(charset [, ...])

Returns first accepted charset.

```javascript
req.acceptsCharsets('utf-8', 'iso-8859-1')
```

#### req.acceptsEncodings(encoding [, ...])

Returns first accepted encoding.

```javascript
req.acceptsEncodings('gzip', 'deflate')
```

#### req.acceptsLanguages(lang [, ...])

Returns first accepted language.

```javascript
req.acceptsLanguages('en', 'es')
```

#### req.get(field)

Returns the specified HTTP request header (case-insensitive).

```javascript
req.get('Content-Type')  // "text/plain"
req.get('content-type')  // "text/plain"
```

#### req.is(type)

Returns matching content type if incoming Content-Type matches.

```javascript
// Content-Type: text/html; charset=utf-8
req.is('html')       // 'html'
req.is('text/html')  // 'text/html'
req.is('text/*')     // 'text/*'
req.is('json')       // false
```

#### req.range(size[, options])

Parses Range header.

```javascript
const range = req.range(1000)
if (range.type === 'bytes') {
  range.forEach(r => {
    // r.start, r.end
  })
}
```

---

## Response (res)

The res object represents the HTTP response.

### Properties

#### res.app

Reference to the Express application.

#### res.headersSent

Boolean indicating if headers have been sent.

```javascript
app.get('/', (req, res) => {
  console.log(res.headersSent) // false
  res.send('OK')
  console.log(res.headersSent) // true
})
```

#### res.locals

Local variables scoped to the request, available in templates.

```javascript
app.use((req, res, next) => {
  res.locals.user = req.user
  next()
})
```

### Methods

#### res.append(field [, value])

Appends value to HTTP response header.

```javascript
res.append('Link', ['<http://localhost/>', '<http://localhost:3000/>'])
res.append('Set-Cookie', 'foo=bar; Path=/; HttpOnly')
```

#### res.attachment([filename])

Sets Content-Disposition header to "attachment".

```javascript
res.attachment()            // Content-Disposition: attachment
res.attachment('logo.png')  // Content-Disposition: attachment; filename="logo.png"
```

#### res.cookie(name, value [, options])

Sets a cookie.

```javascript
res.cookie('name', 'tobi', { 
  domain: '.example.com', 
  path: '/admin', 
  secure: true,
  httpOnly: true,
  maxAge: 900000,
  sameSite: 'strict'
})

// Signed cookie
res.cookie('name', 'tobi', { signed: true })
```

| Option | Type | Description |
|--------|------|-------------|
| `domain` | String | Cookie domain |
| `encode` | Function | Cookie value encoding function |
| `expires` | Date | Expiry date in GMT |
| `httpOnly` | Boolean | Only accessible by web server |
| `maxAge` | Number | Expiry time relative to now in ms |
| `path` | String | Cookie path (default: "/") |
| `partitioned` | Boolean | Partitioned storage (CHIPS) |
| `priority` | String | Cookie priority |
| `secure` | Boolean | HTTPS only |
| `signed` | Boolean | Sign the cookie |
| `sameSite` | Boolean/String | SameSite attribute |

#### res.clearCookie(name [, options])

Clears a cookie.

```javascript
res.clearCookie('name', { path: '/admin' })
```

**Express 5 Change**: Ignores `maxAge` and `expires` options.

#### res.download(path [, filename] [, options] [, fn])

Transfers file as attachment.

```javascript
res.download('/report.pdf')
res.download('/report.pdf', 'report-2024.pdf')
res.download('/report.pdf', (err) => {
  if (err) {
    // Handle error, check res.headersSent
  }
})
```

#### res.end([data[, encoding]])

Ends the response process.

```javascript
res.end()
res.status(404).end()
```

#### res.format(object)

Performs content negotiation on Accept header.

```javascript
res.format({
  'text/plain': () => res.send('hey'),
  'text/html': () => res.send('<p>hey</p>'),
  'application/json': () => res.send({ message: 'hey' }),
  default: () => res.status(406).send('Not Acceptable')
})
```

#### res.get(field)

Returns the HTTP response header.

```javascript
res.get('Content-Type') // "text/plain"
```

#### res.json([body])

Sends a JSON response.

```javascript
res.json(null)
res.json({ user: 'tobi' })
res.status(500).json({ error: 'message' })
```

#### res.jsonp([body])

Sends JSON response with JSONP support.

```javascript
// ?callback=foo
res.jsonp({ user: 'tobi' }) // foo({"user":"tobi"})
```

#### res.links(links)

Sets Link header.

```javascript
res.links({
  next: 'http://api.example.com/users?page=2',
  last: 'http://api.example.com/users?page=5'
})
// Link: <http://api.example.com/users?page=2>; rel="next", ...
```

#### res.location(path)

Sets the Location header.

```javascript
res.location('/foo/bar')
res.location('http://example.com')
```

#### res.redirect([status,] path)

Redirects to the specified URL.

```javascript
res.redirect('/foo/bar')
res.redirect('http://example.com')
res.redirect(301, 'http://example.com')
res.redirect('../login')
```

**Express 5 Change**: `res.redirect('back')` removed. Use:
```javascript
res.redirect(req.get('Referrer') || '/')
```

#### res.render(view [, locals] [, callback])

Renders a view template.

```javascript
res.render('index')
res.render('user', { name: 'Tobi' })
res.render('index', (err, html) => {
  if (err) return next(err)
  res.send(html)
})
```

#### res.send([body])

Sends the HTTP response. Body can be Buffer, String, Object, Boolean, or Array.

```javascript
res.send(Buffer.from('whoop'))
res.send({ some: 'json' })
res.send('<p>some html</p>')
res.status(404).send('Sorry, not found')
```

#### res.sendFile(path [, options] [, fn])

Sends a file.

```javascript
res.sendFile('/path/to/file.pdf')
res.sendFile('file.pdf', { root: __dirname + '/public' })
res.sendFile(path, (err) => {
  if (err) next(err)
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `maxAge` | 0 | Cache-Control max-age in ms |
| `root` | - | Root directory for relative paths |
| `lastModified` | true | Set Last-Modified header |
| `headers` | - | Object of headers to serve |
| `dotfiles` | "ignore" | Dotfile handling |
| `acceptRanges` | true | Accept ranged requests |
| `cacheControl` | true | Set Cache-Control header |
| `immutable` | false | Immutable directive |

#### res.sendStatus(statusCode)

Sets status code and sends its string representation.

```javascript
res.sendStatus(200) // 'OK'
res.sendStatus(403) // 'Forbidden'
res.sendStatus(404) // 'Not Found'
res.sendStatus(500) // 'Internal Server Error'
```

**Express 5 Change**: Only accepts integers 100-999.

#### res.set(field [, value])

Sets response header(s).

```javascript
res.set('Content-Type', 'text/plain')
res.set({
  'Content-Type': 'text/plain',
  'Content-Length': '123',
  'ETag': '12345'
})
```

#### res.status(code)

Sets the HTTP status code (chainable).

```javascript
res.status(403).end()
res.status(400).send('Bad Request')
res.status(404).sendFile('/absolute/path/to/404.png')
```

**Express 5 Change**: Only accepts integers 100-999.

#### res.type(type)

Sets Content-Type header.

```javascript
res.type('.html')           // 'text/html'
res.type('html')            // 'text/html'
res.type('json')            // 'application/json'
res.type('application/json') // 'application/json'
res.type('png')             // 'image/png'
```

#### res.vary(field)

Adds field to Vary header.

```javascript
res.vary('User-Agent').render('docs')
```

**Express 5 Change**: Throws error if field argument is missing.

---

## Router

A router is a mini-application for middleware and routes.

```javascript
const express = require('express')
const router = express.Router()

// Middleware specific to this router
router.use((req, res, next) => {
  console.log('Time:', Date.now())
  next()
})

// Routes
router.get('/', (req, res) => {
  res.send('Home page')
})

router.get('/about', (req, res) => {
  res.send('About page')
})

module.exports = router
```

### Methods

#### router.all(path, [callback, ...] callback)

Matches all HTTP methods.

```javascript
router.all('/*splat', requireAuthentication)
```

#### router.METHOD(path, [callback, ...] callback)

Routes HTTP requests (get, post, put, delete, etc.).

```javascript
router.get('/', (req, res) => res.send('GET'))
router.post('/', (req, res) => res.send('POST'))
```

#### router.param(name, callback)

Add callback triggers to route parameters.

```javascript
router.param('user', (req, res, next, id) => {
  User.find(id, (err, user) => {
    if (err) return next(err)
    req.user = user
    next()
  })
})
```

#### router.route(path)

Returns single route for chaining.

```javascript
router.route('/users/:user_id')
  .all((req, res, next) => {
    // Runs for all HTTP verbs
    next()
  })
  .get((req, res) => {
    res.json(req.user)
  })
  .put((req, res) => {
    req.user.name = req.body.name
    res.json(req.user)
  })
  .delete((req, res) => {
    // Delete user
  })
```

#### router.use([path], [function, ...] function)

Uses middleware.

```javascript
router.use(express.json())
router.use('/users', usersRouter)
router.use((req, res, next) => {
  // Middleware for all routes
  next()
})
```

---

## Path Matching (Express 5)

Express 5 uses updated path-to-regexp syntax:

### Named Parameters

```javascript
app.get('/users/:id', handler)           // /users/123 → { id: '123' }
app.get('/flights/:from-:to', handler)   // /flights/LAX-SFO → { from: 'LAX', to: 'SFO' }
app.get('/plantae/:genus.:species', handler) // /plantae/Prunus.persica
```

### Wildcard Parameters (Must Be Named)

```javascript
// Express 5 - wildcards must be named
app.get('/*splat', handler)              // Matches: /foo, /foo/bar
app.get('/files/*filepath', handler)     // req.params.filepath = ['path', 'to', 'file']

// Optional root path matching
app.get('/{*splat}', handler)            // Matches: /, /foo, /foo/bar
```

### Optional Parameters (Use Braces)

```javascript
// Express 5 syntax
app.get('/:file{.:ext}', handler)        // Matches: /image, /image.png

// Unmatched optionals are omitted from req.params (not undefined)
```

### Regular Expressions in Parameters

```javascript
app.get('/user/:userId(\\d+)', handler)  // Only digits
```

### Path Arrays

```javascript
app.get(['/users', '/people'], handler)
