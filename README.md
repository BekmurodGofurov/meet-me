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
  <a href="docs/contract.md">Documentation</a>
</h4>

<p align="center">
  High-performance, peer-to-peer video conferencing and real-time collaboration engine built with WebRTC & WebSocket signaling.
</p>

<p align="center">
  <a href="https://hub.xerj.org/contributors/BekmurodGofurov">
    <img src="https://hub.xerj.org/contributors/BekmurodGofurov/badge.svg" alt="XERJ Corpus Hub contributor" />
  </a>
  <br>
  <sub>Indexed in <b>XERJ Corpus Hub</b> as a reference WebRTC dual-stream implementation for AI coding agents.</sub>
</p>

<p align="center">
  <a href="https://meet-me.bekmurod.uz" target="_blank" rel="noopener noreferrer"><img src="assets/live-demo.svg" alt="Live Demo" /></a>
  <a href="https://github.com/BekmurodGofurov/meet-me/actions/workflows/ci.yml"><img src="https://github.com/BekmurodGofurov/meet-me/actions/workflows/ci.yml/badge.svg" alt="CI/CD Status" /></a>
  <a href="?tab=License-1-ov-file#readme"><img src="https://img.shields.io/badge/license-ISC-blue.svg" alt="Meet-Me is released under the ISC license." /></a>
  <a href="?tab=Contributing-1-ov-file#readme"><img src="https://img.shields.io/badge/PRs-welcome-orange.svg?style=flat" alt="PRs welcome!" /></a>
</p>

---

## Getting Started

To set up and run Meet-Me locally on your machine, visit the [Installation Guide](INSTALLATION.md).

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

We welcome contributions to Meet-Me. Please review our [Contribution Guide](?tab=Contributing-1-ov-file#readme) to learn how to propose features, report issues, and submit pull requests.

For security concerns and vulnerability reporting, please read our [Security Policy](?tab=Security-1-ov-file#readme).

## License

Licensed under the [ISC License](?tab=License-1-ov-file#readme).
