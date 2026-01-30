# Express.js Quickstart Guide

Get started with Express.js 5.x quickly.

## Requirements

- **Node.js 18 or higher** (required for Express 5)

Check your Node.js version:

```bash
node --version
```

## Installation

### Create a New Project

```bash
mkdir myapp
cd myapp
npm init -y
```

### Install Express

```bash
npm install express
```

This installs Express 5.x (the current default).

## Hello World

Create `app.js`:

```javascript
const express = require('express')
const app = express()
const port = 3000

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
```

Run the app:

```bash
node app.js
```

Visit http://localhost:3000 to see "Hello World!"

## Basic Routing

```javascript
const express = require('express')
const app = express()

// GET request to the homepage
app.get('/', (req, res) => {
  res.send('Hello World!')
})

// POST request to the homepage
app.post('/', (req, res) => {
  res.send('Got a POST request')
})

// PUT request to /user
app.put('/user', (req, res) => {
  res.send('Got a PUT request at /user')
})

// DELETE request to /user
app.delete('/user', (req, res) => {
  res.send('Got a DELETE request at /user')
})

app.listen(3000)
```

## Static Files

Serve static files (images, CSS, JavaScript) from a directory:

```javascript
app.use(express.static('public'))
```

Files in `public/` are now accessible:
- `public/images/logo.png` → `http://localhost:3000/images/logo.png`
- `public/css/style.css` → `http://localhost:3000/css/style.css`

### Virtual Path Prefix

```javascript
app.use('/static', express.static('public'))
```

Files are now at:
- `http://localhost:3000/static/images/logo.png`

### Multiple Static Directories

```javascript
app.use(express.static('public'))
app.use(express.static('files'))
```

Express looks for files in the order directories are added.

## Express Generator

Use the application generator to quickly create an app skeleton:

```bash
npx express-generator myapp
cd myapp
npm install
npm start
```

### Generator Options

```bash
npx express-generator --help

Options:
  --version      output version number
  -e, --ejs      add ejs engine support
  --pug          add pug engine support
  --hbs          add handlebars engine support
  -H, --hogan    add hogan.js engine support
  --no-view      generate without view engine
  -v, --view     add view <engine> support (dust|ejs|hbs|hjs|jade|pug|twig|vash)
  -c, --css      add stylesheet <engine> support (less|stylus|compass|sass)
  --git          add .gitignore
  -f, --force    force on non-empty directory
```

### Example with Pug

```bash
npx express-generator --view=pug myapp
```

### Generated Structure

```
myapp/
├── app.js
├── bin/
│   └── www
├── package.json
├── public/
│   ├── images/
│   ├── javascripts/
│   └── stylesheets/
│       └── style.css
├── routes/
│   ├── index.js
│   └── users.js
└── views/
    ├── error.pug
    ├── index.pug
    └── layout.pug
```

## JSON API Setup

Common setup for a JSON API:

```javascript
const express = require('express')
const app = express()

// Parse JSON bodies
app.use(express.json())

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }))

// CORS (if needed)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  next()
})

// Routes
app.get('/api/users', (req, res) => {
  res.json([
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' }
  ])
})

app.post('/api/users', (req, res) => {
  const { name } = req.body
  res.status(201).json({ id: 3, name })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal Server Error' })
})

app.listen(3000, () => {
  console.log('API running on http://localhost:3000')
})
```

## Project Structure

### Simple Structure

```
myapp/
├── app.js          # App entry point
├── package.json
├── public/         # Static files
└── routes/         # Route handlers
    ├── index.js
    └── users.js
```

### Feature-Based Structure

```
myapp/
├── app.js
├── package.json
├── config/
│   └── database.js
├── middleware/
│   ├── auth.js
│   └── errorHandler.js
├── routes/
│   ├── index.js
│   └── api/
│       ├── users.js
│       └── posts.js
├── models/
│   ├── User.js
│   └── Post.js
├── controllers/
│   ├── userController.js
│   └── postController.js
├── services/
│   └── emailService.js
├── utils/
│   └── helpers.js
├── public/
└── views/
```

## Environment Variables

Use environment variables for configuration:

```bash
npm install dotenv
```

Create `.env`:

```
PORT=3000
NODE_ENV=development
DATABASE_URL=mongodb://localhost/myapp
```

Load in `app.js`:

```javascript
require('dotenv').config()

const port = process.env.PORT || 3000
const dbUrl = process.env.DATABASE_URL
```

## Development Tools

### Nodemon (Auto-restart)

```bash
npm install -D nodemon
```

Add to `package.json`:

```json
{
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js"
  }
}
```

Run:

```bash
npm run dev
```

### Debug Mode

```bash
DEBUG=express:* node app.js
```

## Common Middleware Setup

```javascript
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const compression = require('compression')

const app = express()

// Security headers
app.use(helmet())

// CORS
app.use(cors())

// Logging
app.use(morgan('dev'))

// Compression
app.use(compression())

// Body parsing
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// Static files
app.use(express.static('public'))
```

Install all middleware:

```bash
npm install helmet cors morgan compression
```

## TypeScript Setup

```bash
npm install typescript @types/node @types/express ts-node -D
npx tsc --init
```

Create `app.ts`:

```typescript
import express, { Request, Response, NextFunction } from 'express'

const app = express()
const port = process.env.PORT || 3000

app.get('/', (req: Request, res: Response) => {
  res.send('Hello TypeScript!')
})

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack)
  res.status(500).send('Something broke!')
})

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
```

Add to `package.json`:

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/app.js",
    "dev": "ts-node app.ts"
  }
}
```

## ES Modules

To use ES modules (`import`/`export`):

Add to `package.json`:

```json
{
  "type": "module"
}
```

Update code:

```javascript
import express from 'express'

const app = express()

app.get('/', (req, res) => {
  res.send('Hello ES Modules!')
})

export default app
```

## Next Steps

1. **Routing** - See `references/guide/routing.md`
2. **Middleware** - See `references/guide/middleware.md`
3. **Error Handling** - See `references/guide/error-handling.md`
4. **Security** - See `references/advanced/security.md`
5. **Performance** - See `references/advanced/performance.md`
6. **API Reference** - See `references/api/api-reference.md`
