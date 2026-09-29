# Contributing to Smooth Slideshow

Thank you for your interest in contributing!

## Development Setup

1. Clone your fork of the repository:
   ```bash
   git clone https://github.com/<your-username>/smooth-slideshow.git
   cd smooth-slideshow
   ```
2. Install dependencies:
   ```bash
   npm ci
   ```
3. Start the application in development mode:
   ```bash
   npm start
   ```

## Running Tests

Before submitting a Pull Request, please ensure all tests pass:

```bash
npm test
npm run perf
```

## Pull Request Guidelines

- Keep changes focused and well-documented.
- Maintain existing coding conventions and 60fps performance principles.
- Verify that image preloading and DOM element cleanup are preserved to prevent memory leaks.
