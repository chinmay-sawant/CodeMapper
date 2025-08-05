# CodeMapper 🗺️

## Overview

CodeMapper is a tool designed to **analyze large Go codebases** and visualize function dependencies in an interactive graph.  
It helps you understand how functions and methods are connected across your project, making onboarding and refactoring much easier! 🚀

---

## Problem Statement ❓

When working with **40+ repositories**, it becomes a nightmare to manually analyze, trace, and understand all the interdependencies between functions and packages.  
CodeMapper automates this process, saving you countless hours and reducing the risk of missing critical connections. 🔍

---

## Features ✨

- **Automatic Go code analysis** 🧑‍💻
- **Dependency mapping** between functions and methods 🔗
- **Interactive visualization** in your browser 🌐
- **Easy to use**: just point to your repo and run!

---

## How It Works ⚙️

1. **Scan your Go project**:  
   CodeMapper parses your codebase, finds all function/method definitions and their call sites.

2. **Generates a dependency map**:  
   Outputs a JSON file mapping all relationships.

3. **Visualizes the map**:  
   Launches a web server with a beautiful, interactive graph UI.

---

## Installation 🛠️

### Backend (Go)

1. **Install Go** (if not already):  
   [Download Go](https://go.dev/dl/)

2. **Install Go dependencies**:  
   ```bash
   cd CodeMapper
   go mod tidy
   ```

### Frontend (Visualizer)

1. **Install Node.js** (if not already):  
   [Download Node.js](https://nodejs.org/)

2. **Install frontend dependencies**:  
   ```bash
   cd CodeMapper
   npm install
   ```

---

## Quick Start 🚦

```bash
# 1. Build and run CodeMapper on your Go project
go run main.go -path ./YourGoProject -serve :8080
go run main.go -path ./EmployeeApp -serve :8080

# 2. Open your browser and visit
http://localhost:8080
```

---

## Project Structure 🏗️

- `main.go` - Analyzer and web server
- `visualizer/` - React-based frontend for visualization
- `codemap.json` - Generated dependency map

---
## Screenshot 🖼️

![CodeMapper Screenshot](https://github.com/chinmay-sawant/CodeMapper/blob/master/screenshot/image1.png)

---
## License 📄

MIT

---

## Made with ❤️ for developers who want to see the big picture!
