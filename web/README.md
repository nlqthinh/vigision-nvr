This is the Vigision frontend which connects to and provides a User Interface to the Python backend.

# Web Development

## Installing Web Dependencies Via NPM

Within `/web`, run:

```bash
npm install
```

## Running development frontend

Within `/web`, run:

```bash
PROXY_HOST=<ip_address:port> npm run dev
```

The Proxy Host can point to your existing Vigision instance. Otherwise defaults to `localhost:5000` if running Vigision on the same machine.

## Extensions
Install these IDE extensions for an improved development experience:
- eslint
