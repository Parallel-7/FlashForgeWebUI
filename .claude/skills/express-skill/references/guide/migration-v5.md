# Migrating to Express 5

Express 5 maintains the same basic API as Express 4 but includes breaking changes. This guide covers everything needed to migrate.

## Requirements

- **Node.js 18 or higher** is required for Express 5

## Installation

```bash
npm install "express@5"
```

## Automated Migration

Use the Express codemod tool to automatically update code:

```bash
# Run all codemods
npx @expressjs/codemod upgrade

# Run a specific codemod
npx @expressjs/codemod name-of-the-codemod
```

Available codemods: https://github.com/expressjs/codemod

## Removed Methods and Properties

### app.del() → app.delete()

```javascript
// Express 4
app.del('/user/:id', handler)

// Express 5
app.delete('/user/:id', handler)
```

### app.param(fn)

The `app.param(fn)` signature for modifying `app.param()` behavior is no longer supported.

### Pluralized Method Names

```javascript
// Express 4 (deprecated)
req.acceptsCharset('utf-8')
req.acceptsEncoding('br')
req.acceptsLanguage('en')

// Express 5
req.acceptsCharsets('utf-8')
req.acceptsEncodings('br')
req.acceptsLanguages('en')
```

### Leading Colon in app.param()

The leading colon in parameter names is silently ignored (was deprecated in v4):

```javascript
// Both work the same in Express 5
app.param('user', handler)
app.param(':user', handler)  // colon is ignored
```

### req.param(name)

Removed. Use specific objects instead:

```javascript
// Express 4
const id = req.param('id')
const body = req.param('body')
const query = req.param('query')

// Express 5
const id = req.params.id
const body = req.body
const query = req.query
```

### res.json(obj, status)

```javascript
// Express 4
res.json({ name: 'Ruben' }, 201)

// Express 5
res.status(201).json({ name: 'Ruben' })
```

### res.jsonp(obj, status)

```javascript
// Express 4
res.jsonp({ name: 'Ruben' }, 201)

// Express 5
res.status(201).jsonp({ name: 'Ruben' })
```

### res.redirect(url, status)

```javascript
// Express 4
res.redirect('/users', 301)

// Express 5
res.redirect(301, '/users')
```

### res.redirect('back') and res.location('back')

The magic string `'back'` is no longer supported:

```javascript
// Express 4
res.redirect('back')

// Express 5
res.redirect(req.get('Referrer') || '/')
```

### res.send(body, status)

```javascript
// Express 4
res.send({ name: 'Ruben' }, 200)

// Express 5
res.status(200).send({ name: 'Ruben' })
```

### res.send(status)

Cannot send a number as the response body:

```javascript
// Express 4
res.send(200)

// Express 5
res.sendStatus(200)

// Or to send a number as the body:
res.send('200')  // String
```

### res.sendfile() → res.sendFile()

```javascript
// Express 4
res.sendfile('/path/to/file')

// Express 5
res.sendFile('/path/to/file')
```

**Note**: MIME types have changed in Express 5:
- `.js` → `"text/javascript"` (was `"application/javascript"`)
- `.json` → `"application/json"` (was `"text/json"`)
- `.css` → `"text/css"` (was `"text/plain"`)
- `.xml` → `"application/xml"` (was `"text/xml"`)
- `.woff` → `"font/woff"` (was `"application/font-woff"`)
- `.svg` → `"image/svg+xml"` (was `"application/svg+xml"`)

### router.param(fn)

No longer supported (was deprecated in v4.11.0).

### express.static.mime

Use the `mime-types` package instead:

```javascript
// Express 4
express.static.mime.lookup('json')

// Express 5
const mime = require('mime-types')
mime.lookup('json')
```

### express:router Debug Logs

Debug namespace changed:

```bash
# Express 4
DEBUG=express:* node index.js

# Express 5
DEBUG=express:*,router,router:* node index.js
```

## Changed Behavior

### Path Route Matching Syntax

#### Wildcards Must Be Named

```javascript
// Express 4
app.get('/*', handler)

// Express 5
app.get('/*splat', handler)

// To match root path as well
app.get('/{*splat}', handler)  // Matches /, /foo, /foo/bar
```

#### Optional Parameters Use Braces

```javascript
// Express 4
app.get('/:file.:ext?', handler)

// Express 5
app.get('/:file{.:ext}', handler)
```

#### No Regexp Characters in Paths

```javascript
// Express 4
app.get('/[discussion|page]/:slug', handler)

// Express 5 - use arrays
app.get(['/discussion/:slug', '/page/:slug'], handler)
```

#### Reserved Characters

Characters `()[]?+!` are reserved. Escape with `\`:

```javascript
app.get('/path\\(with\\)parens', handler)
```

#### Parameter Names

Support valid JavaScript identifiers or quoted names:

```javascript
app.get('/:"this"', handler)
```

### Rejected Promises Handled Automatically

**Major improvement**: No more async wrappers needed:

```javascript
// Express 5 - just works
app.get('/user/:id', async (req, res) => {
  const user = await getUserById(req.params.id)  // Errors caught automatically
  res.send(user)
})
```

### express.urlencoded

The `extended` option now defaults to `false`:

```javascript
// Express 4 default
app.use(express.urlencoded())  // extended: true

// Express 5 default
app.use(express.urlencoded())  // extended: false

// To get v4 behavior
app.use(express.urlencoded({ extended: true }))
```

### express.static dotfiles

The `dotfiles` option now defaults to `"ignore"`:

```javascript
// Express 4 - dotfiles served by default
app.use(express.static('public'))

// Express 5 - dotfiles ignored by default
// /.well-known/assetlinks.json returns 404

// To serve specific dot-directories
app.use('/.well-known', express.static('public/.well-known', { dotfiles: 'allow' }))
app.use(express.static('public'))
```

### app.listen Error Handling

Errors passed to callback instead of thrown:

```javascript
// Express 4 - errors thrown
const server = app.listen(8080, () => {
  console.log('Listening')
})

// Express 5 - errors passed to callback
const server = app.listen(8080, '0.0.0.0', (error) => {
  if (error) {
    throw error  // e.g., EADDRINUSE
  }
  console.log(`Listening on ${JSON.stringify(server.address())}`)
})
```

### app.router

The `app.router` object is back (was removed in v4):

```javascript
const router = app.router  // Reference to base Express router
```

### req.body

Returns `undefined` when body not parsed (was `{}` in v4):

```javascript
// Express 4
console.log(req.body)  // {} when no body-parser

// Express 5
console.log(req.body)  // undefined when no body-parser
```

### req.host

Now includes port number:

```javascript
// Host: "example.com:3000"

// Express 4
req.host  // "example.com"

// Express 5
req.host  // "example.com:3000"
```

### req.params

**Null prototype** when using string paths:

```javascript
app.get('/*splat', (req, res) => {
  console.log(req.params)  // [Object: null prototype] { splat: [...] }
})
```

**Wildcard parameters are arrays**:

```javascript
// GET /foo/bar
req.params.splat  // ['foo', 'bar'] - not 'foo/bar'
```

**Unmatched parameters omitted** (not `undefined`):

```javascript
// Express 4
app.get('/:file.:ext?', handler)
// GET /image → { file: 'image', ext: undefined }

// Express 5
app.get('/:file{.:ext}', handler)
// GET /image → { file: 'image' } - no ext key
```

### req.query

- No longer writable (is a getter)
- Default parser changed from `"extended"` to `"simple"`

### res.clearCookie

Ignores `maxAge` and `expires` options.

### res.status

Only accepts integers 100-999:

```javascript
res.status(404)     // OK
res.status('404')   // Error
res.status(99)      // Error
res.status(1000)    // Error
```

### res.vary

Throws error if `field` argument is missing (was a warning in v4).

## Improvements

### res.render()

Now enforces async behavior for all view engines.

### Brotli Encoding Support

Express 5 supports Brotli compression for clients that support it.

## Migration Checklist

### Before Migration

1. [ ] Update to Node.js 18+
2. [ ] Review current Express 4 deprecation warnings
3. [ ] Run automated tests

### Code Changes

1. [ ] Replace `app.del()` with `app.delete()`
2. [ ] Update pluralized method names (`acceptsCharsets`, etc.)
3. [ ] Replace `req.param()` with specific property access
4. [ ] Fix response method signatures (`res.json()`, `res.send()`, etc.)
5. [ ] Replace `res.redirect('back')` with explicit referrer handling
6. [ ] Update `res.sendfile()` to `res.sendFile()`
7. [ ] Update wildcard routes (`/*` → `/*splat`)
8. [ ] Update optional parameters (`?` → braces)
9. [ ] Replace regexp patterns in paths with arrays
10. [ ] Update `express.static.mime` usage to `mime-types`
11. [ ] Handle `req.body` being `undefined` when not parsed
12. [ ] Handle `app.listen()` errors in callback
13. [ ] Update debug logging namespace

### Configuration

1. [ ] Check `express.urlencoded({ extended: true })` if needed
2. [ ] Configure `dotfiles: 'allow'` for `.well-known` if needed

### Testing

1. [ ] Run automated tests
2. [ ] Test async error handling
3. [ ] Test all route patterns
4. [ ] Verify MIME types for static files
5. [ ] Test error responses

## Quick Reference: Express 4 → 5 Changes

| Feature | Express 4 | Express 5 |
|---------|-----------|-----------|
| Async errors | Manual handling | Auto-caught |
| Wildcard routes | `/*` | `/*splat` |
| Optional params | `/:file.:ext?` | `/:file{.:ext}` |
| `app.del()` | Supported | Use `app.delete()` |
| `res.send(200)` | Sends status | Use `res.sendStatus()` |
| `res.redirect('back')` | Magic string | Use referrer manually |
| `req.body` (no parser) | `{}` | `undefined` |
| `req.host` | Without port | With port |
| `dotfiles` default | Served | Ignored |
| `extended` default | `true` | `false` |
| Node.js version | 0.10+ | 18+ |
