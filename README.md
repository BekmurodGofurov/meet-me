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
  <a href="INSTALLATION.md">Installation</a> |
  <a href="docs/contract.md">Documentation</a> |
  <a href="https://meet-me.bekmurod.uz">Live Demo</a>
</h4>

<p align="center">
  High-performance, peer-to-peer video conferencing and real-time collaboration engine built with WebRTC & WebSocket signaling.
</p>

<p align="center">
  <a href="https://github.com/BekmurodGofurov/meet-me/actions/workflows/ci.yml">
    <img src="https://github.com/BekmurodGofurov/meet-me/actions/workflows/ci.yml/badge.svg" alt="CI/CD Status" />
  </a>
  <a href="https://meet-me.bekmurod.uz">
    <img src="https://img.shields.io/badge/Live%20Demo-meet--me.bekmurod.uz-2563eb?style=flat&logo=googlechrome&logoColor=white" alt="Live Demo" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-ISC-blue.svg" alt="Meet-Me is released under the ISC license." />
  </a>
  <a href="CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
  </a>
</p>

<p align="center">
  <a href="https://webrtc.org/">
    <img src="https://img.shields.io/badge/WebRTC-P2P%20Mesh-orange?style=flat&logo=webrtc&logoColor=white" alt="WebRTC Mesh" />
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/Node.js-%3E%3D22.0.0-339933?style=flat&logo=nodedotjs&logoColor=white" alt="Node Version" />
  </a>
  <a href="https://react.dev/">
    <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=flat&logo=react&logoColor=black" alt="React 19" />
  </a>
  <a href="https://playwright.dev/">
    <img src="https://img.shields.io/badge/E2E-Playwright-45ba4b?style=flat&logo=playwright&logoColor=white" alt="Playwright E2E" />
  </a>
</p>

---

## Getting Started

The fastest way to experience Meet-Me is with the **[Live Demo](https://meet-me.bekmurod.uz)**. Open the link, create a room, share the 6-character code, and start conferencing in seconds.

To set up Meet-Me locally on your machine:

```bash
# Clone the repository
git clone https://github.com/BekmurodGofurov/meet-me.git && cd meet-me

# Quick run (see Installation Guide for details)
cp .env.example .env
npm --prefix backend install && npm --prefix backend start
npm --prefix client install && npm --prefix client run dev
```

For complete step-by-step setup instructions, environment variable descriptions, Docker commands, and local SSL certificates for mobile device testing, please visit the **[Installation Guide](INSTALLATION.md)**.

## About Meet-Me

Meet-Me is an open-source, multi-party video conferencing engine designed to demonstrate the mechanics of WebSocket-based signaling and direct WebRTC peer connections.

Instead of routing media through centralized media servers (SFU or MCU), Meet-Me uses a decentralized full mesh topology designed for small teams (2 to 6 participants). Audio, video, and screen sharing streams travel directly between peer browsers with end-to-end encryption and ultra-low latency, while the lightweight signaling server handles room coordination and message exchange.

Learn more about the signaling message protocol in the [Documentation](docs/contract.md).

## Features

- **Peer-to-Peer Media:** Direct browser-to-browser audio and video streaming over WebRTC mesh topology.
- **Screen Sharing:** Simultaneous screen sharing alongside live camera feeds using dual transceivers.
- **Adaptive Grid & Focus:** Automatic layout prioritization for screen sharing and one-click manual tile pinning.
- **In-Room Chat:** Real-time text messaging over WebSocket with auto-detected hyperlinks.
- **Session Recovery:** Automatic session restoration on page reload with room state retention.
- **NAT Traversal:** Built-in STUN and TURN relay support for connectivity across firewalls.

## Community & Contributions

We welcome contributions to Meet-Me. Please review our [Contribution Guide](CONTRIBUTING.md) to learn how to propose features, report issues, and submit pull requests.

For security concerns and vulnerability reporting, please read our [Security Policy](SECURITY.md).

## License

Licensed under the [ISC License](LICENSE).
