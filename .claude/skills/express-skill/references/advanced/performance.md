# Express Performance Best Practices

Performance and reliability best practices for Express applications in production.

## Things to Do in Your Code

### Use Gzip Compression

Compress responses to reduce payload size:

```bash
npm install compression
```

```javascript
const compression = require('compression')
const express = require('express')
const app = express()

app.use(compression())
```

**Production tip**: For high-traffic sites, implement compression at the reverse proxy (Nginx) instead:

```nginx
# nginx.conf
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
gzip_min_length 1000;
```

### Don't Use Synchronous Functions

Synchronous functions block the event loop:

```javascript
// AVOID in production
const data = fs.readFileSync('/file.json')

// USE async versions
const data = await fs.promises.readFile('/file.json')
// or
fs.readFile('/file.json', (err, data) => { ... })
```

Detect sync calls with `--trace-sync-io`:

```bash
node --trace-sync-io app.js
```

### Do Logging Correctly

`console.log()` and `console.error()` are **synchronous** when writing to terminal/file.

#### For Debugging

Use the [debug](https://www.npmjs.com/package/debug) module:

```bash
npm install debug
```

```javascript
const debug = require('debug')('app:server')
debug('Server starting on port %d', port)
```

```bash
DEBUG=app:* node app.js
```

#### For Application Logging

Use [Pino](https://www.npmjs.com/package/pino) - fastest Node.js logger:

```bash
npm install pino pino-http
```

```javascript
const pino = require('pino')
const pinoHttp = require('pino-http')

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' 
    ? { target: 'pino-pretty' } 
    : undefined
})

app.use(pinoHttp({ logger }))
```

### Handle Exceptions Properly

#### Use try-catch

For synchronous code:

```javascript
app.get('/search', (req, res) => {
  setImmediate(() => {
    const jsonStr = req.query.params
    try {
      const jsonObj = JSON.parse(jsonStr)
      res.send('Success')
    } catch (e) {
      res.status(400).send('Invalid JSON string')
    }
  })
})
```

#### Use Promises (Express 5)

Express 5 automatically catches promise rejections:

```javascript
app.get('/', async (req, res) => {
  const data = await fetchData()  // Errors auto-forwarded to error handler
  res.send(data)
})

app.use((err, req, res, next) => {
  res.status(err.status ?? 500).send({ error: err.message })
})
```

#### Async Middleware (Express 5)

```javascript
app.use(async (req, res, next) => {
  req.locals.user = await getUser(req)
  next()  // Called if promise doesn't throw
})
```

#### What NOT to Do

**Never** use `uncaughtException`:

```javascript
// BAD - Don't do this
process.on('uncaughtException', (err) => {
  console.log('Caught exception:', err)
})
```

This keeps the app running in an unreliable state. Let it crash and use a process manager to restart.

**Never** use the deprecated `domain` module.

## Things to Do in Your Environment

### Set NODE_ENV to "production"

This alone can improve performance 3x:

```bash
NODE_ENV=production node app.js
```

In production, Express:
- Caches view templates
- Caches CSS from CSS extensions
- Generates less verbose error messages

With systemd:

```ini
# /etc/systemd/system/myapp.service
[Service]
Environment=NODE_ENV=production
```

### Ensure App Automatically Restarts

#### Using systemd (Recommended)

Create `/etc/systemd/system/myapp.service`:

```ini
[Unit]
Description=My Express App
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/myapp
ExecStart=/usr/bin/node /var/www/myapp/index.js
Restart=always
RestartSec=10

Environment=NODE_ENV=production
Environment=PORT=3000

# Allow many incoming connections
LimitNOFILE=infinity

# Standard output/error
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=myapp

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable myapp
sudo systemctl start myapp
```

#### Using PM2

```bash
npm install -g pm2
pm2 start app.js --name myapp -i max
pm2 save
pm2 startup
```

### Run Your App in a Cluster

Use all CPU cores with Node's cluster module:

```javascript
const cluster = require('cluster')
const numCPUs = require('os').cpus().length

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`)

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork()
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died, restarting...`)
    cluster.fork()
  })
} else {
  // Workers share TCP connection
  const app = require('./app')
  app.listen(3000)
  console.log(`Worker ${process.pid} started`)
}
```

Or use PM2's cluster mode:

```bash
pm2 start app.js -i max  # Auto-detect CPUs
pm2 start app.js -i 4    # 4 workers
```

**Important**: Clustered apps cannot share memory. Use Redis for sessions and shared state.

### Cache Request Results

#### Application-Level Caching

```javascript
const NodeCache = require('node-cache')
const cache = new NodeCache({ stdTTL: 600 })  // 10 min default

app.get('/data/:id', async (req, res) => {
  const cacheKey = `data_${req.params.id}`
  
  let data = cache.get(cacheKey)
  if (!data) {
    data = await fetchDataFromDB(req.params.id)
    cache.set(cacheKey, data)
  }
  
  res.json(data)
})
```

#### Redis Caching

```javascript
const redis = require('redis')
const client = redis.createClient()

app.get('/data/:id', async (req, res) => {
  const cacheKey = `data:${req.params.id}`
  
  const cached = await client.get(cacheKey)
  if (cached) {
    return res.json(JSON.parse(cached))
  }
  
  const data = await fetchDataFromDB(req.params.id)
  await client.setEx(cacheKey, 3600, JSON.stringify(data))  // 1 hour
  res.json(data)
})
```

#### Reverse Proxy Caching (Nginx)

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m max_size=1g inactive=60m;

server {
    location /api/ {
        proxy_cache my_cache;
        proxy_cache_valid 200 10m;
        proxy_cache_valid 404 1m;
        proxy_pass http://localhost:3000;
    }
}
```

### Use a Load Balancer

Distribute traffic across multiple instances:

#### Nginx Load Balancer

```nginx
upstream myapp {
    least_conn;  # or ip_hash for sticky sessions
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
    server 127.0.0.1:3004;
}

server {
    listen 80;
    
    location / {
        proxy_pass http://myapp;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Use a Reverse Proxy

Run Express behind Nginx or HAProxy for:
- TLS termination
- Gzip compression
- Static file serving
- Load balancing
- Caching
- Rate limiting

#### Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # Static files
    location /static/ {
        alias /var/www/myapp/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Configure Express to trust the proxy:

```javascript
app.set('trust proxy', 1)  // Trust first proxy
```

## Health Checks and Graceful Shutdown

### Health Check Endpoint

```javascript
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' })
})

// Detailed health check
app.get('/health/detailed', async (req, res) => {
  const health = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    checks: {}
  }
  
  try {
    await db.query('SELECT 1')
    health.checks.database = 'healthy'
  } catch (e) {
    health.checks.database = 'unhealthy'
    health.message = 'Degraded'
  }
  
  try {
    await redis.ping()
    health.checks.redis = 'healthy'
  } catch (e) {
    health.checks.redis = 'unhealthy'
    health.message = 'Degraded'
  }
  
  const status = health.message === 'OK' ? 200 : 503
  res.status(status).json(health)
})
```

### Graceful Shutdown

```javascript
const server = app.listen(3000)

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

function gracefulShutdown() {
  console.log('Received shutdown signal, closing server...')
  
  server.close(() => {
    console.log('HTTP server closed')
    
    // Close database connections
    db.end(() => {
      console.log('Database connections closed')
      process.exit(0)
    })
  })
  
  // Force close after timeout
  setTimeout(() => {
    console.error('Could not close connections in time, forcing shutdown')
    process.exit(1)
  }, 30000)
}
```

## Performance Monitoring

### Built-in Metrics

```javascript
app.get('/metrics', (req, res) => {
  res.json({
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    cpuUsage: process.cpuUsage()
  })
})
```

### Response Time Header

```javascript
const onHeaders = require('on-headers')

app.use((req, res, next) => {
  const start = Date.now()
  
  onHeaders(res, () => {
    const duration = Date.now() - start
    res.setHeader('X-Response-Time', `${duration}ms`)
  })
  
  next()
})
```

### APM Tools

Consider using Application Performance Monitoring:
- Datadog
- New Relic
- Dynatrace
- Elastic APM

## Performance Checklist

### Code

- [ ] Use async functions, avoid sync operations
- [ ] Use Pino for logging (not console.log)
- [ ] Handle errors properly with try-catch and promises
- [ ] Implement caching where appropriate
- [ ] Compress responses

### Environment

- [ ] Set `NODE_ENV=production`
- [ ] Use a process manager (systemd/PM2)
- [ ] Run in cluster mode (multiple workers)
- [ ] Use a reverse proxy (Nginx)
- [ ] Enable HTTP/2
- [ ] Use TLS 1.3
- [ ] Implement health checks
- [ ] Add graceful shutdown handling

### Infrastructure

- [ ] Use a CDN for static assets
- [ ] Implement database connection pooling
- [ ] Use Redis for sessions and caching
- [ ] Set up load balancing for multiple servers
- [ ] Configure proper timeouts
- [ ] Monitor application metrics
