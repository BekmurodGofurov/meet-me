# Contributing to Meet-Me

Thank you for your interest in contributing to Meet-Me! We welcome contributions, bug reports, and suggestions from the community.

## Code of Conduct

Please maintain a respectful, inclusive, and professional environment for everyone.

## Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/meet-me.git
   cd meet-me
   ```
3. **Install dependencies**:
   ```bash
   npm --prefix backend install
   npm --prefix client install
   npm --prefix e2e install
   ```

## Development Workflow

1. Create a descriptive branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```
2. Make your changes adhering to existing architecture:
   - Keep the signaling layer separate from media streaming.
   - Preserve message shapes specified in [`docs/contract.md`](docs/contract.md).
3. Ensure all test suites pass:
   ```bash
   # Backend tests
   npm --prefix backend test

   # Client tests & lint
   npm --prefix client test
   npm --prefix client run lint

   # E2E tests
   npm --prefix e2e test
   ```
4. Commit your changes following conventional commits:
   ```bash
   git commit -m "feat(scope): concise description of changes"
   ```
5. Push to your branch and open a Pull Request against `main`.

## Reporting Issues

If you encounter bugs or unexpected behavior:
- Check existing [GitHub Issues](https://github.com/BekmurodGofurov/meet-me/issues) to avoid duplicates.
- Provide a clear title, reproduction steps, expected vs. actual behavior, and browser/OS versions.
