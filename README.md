<p align="center">
  <a href="https://meet-me.bekmurod.uz">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
      <img alt="Meet-Me logo" src="assets/logo-dark.svg" width="90">
    </picture>
  </a>
</p>

<h1 align="center">
  Meet-Me
</h1>

<h4 align="center">
  <a href="docs/contract.md">Documentation</a> |
  <a href="https://meet-me.bekmurod.uz">Website</a>
</h4>

<p align="center">
  Peer-to-peer video conferencing and real-time collaboration engine
</p>

<p align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-ISC-blue.svg" alt="Meet-Me is released under the ISC license." />
  </a>
  <a href="CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
  </a>
  <a href="https://github.com/BekmurodGofurov/meet-me/actions/workflows/ci.yml">
    <img src="https://github.com/BekmurodGofurov/meet-me/actions/workflows/ci.yml/badge.svg" alt="Build status" />
  </a>
</p>

## Getting Started

The fastest way to experience Meet-Me is with the [Live Demo](https://meet-me.bekmurod.uz). Create a room, share the 6-character code, and connect immediately.

To set up Meet-Me locally:

1. Clone the repository:
   ```bash
   git clone https://github.com/BekmurodGofurov/meet-me.git
   cd meet-me
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```

3. Install dependencies:
   ```bash
   npm --prefix backend install
   npm --prefix client install
   ```

4. Start the application:
   ```bash
   # Terminal 1 - Signaling Server
   npm --prefix backend start

   # Terminal 2 - Frontend Client
   npm --prefix client run dev
   ```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## About Meet-Me

Meet-Me is a lightweight, multi-party video conferencing engine built with WebSocket signaling and WebRTC peer connections.

Instead of routing media through centralized media servers (SFU or MCU), Meet-Me uses a decentralized full mesh topology designed for small teams (2 to 6 participants). Audio, video, and screen sharing streams travel directly between peer browsers with end-to-end encryption and ultra-low latency, while the signaling server handles room coordination and message exchange.

Learn more about the signaling message protocol in the [Documentation](docs/contract.md).

## Features

- **Peer-to-Peer Media:** Direct browser-to-browser audio and video streaming over WebRTC mesh topology.
- **Screen Sharing:** Simultaneous screen sharing alongside live camera feeds.
- **Adaptive Grid & Focus:** Automatic layout prioritization for screen sharing and manual tile pinning.
- **In-Room Chat:** Real-time text messaging over WebSocket with auto-detected hyperlinks.
- **Session Recovery:** Automatic session restoration on page reload with room state retention.
- **NAT Traversal:** Built-in STUN and TURN relay support for connectivity across firewalls.

## Community & Contributions

We welcome contributions to Meet-Me. Please review our [Contribution Guide](CONTRIBUTING.md) to learn how to propose features, report issues, and submit pull requests.

For security concerns and vulnerability reporting, please read our [Security Policy](SECURITY.md).

## License

Licensed under the [ISC License](LICENSE).
