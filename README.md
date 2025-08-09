# CodeMapper 🗺️

## Overview

CodeMapper is a tool designed to **analyze large Go codebases** and visualize function dependencies in an interactive graph.  
It helps you understand how functions and methods are connected across your project, making onboarding and refactoring much easier! 🚀

---
## Problem Statement ❓

Analyzing over **40+ repositories** for a recent project was extremely time-consuming and challenging, especially given the tight deadlines and complex interdependencies between packages. Manual tracing of function calls and dependencies quickly became unmanageable. To address this, I built CodeMapper to automate the analysis and visualization process, making it much faster and easier to understand large Go codebases.

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

2. **Clone the repository and install dependencies**:  
   ```bash
   git clone https://github.com/chinmay-sawant/CodeMapper.git
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
go run main.go -path "./revel" -gopath "C:\Users\acer\go\pkg\mod" -analyze-deps "bitbucket.org/ggwp1,bitbucket.org/ggwp2" -out "full-codemap.json" -serve ":8080"
# 2. Open your browser and visit
http://localhost:8080
```
## Command Line Arguments Documentation

This application accepts the following command line arguments:

- `-path`: Specifies the path to the project directory to analyze (e.g., `./revel`).
- `-gopath`: Sets the Go module cache directory (e.g., `C:\Users\acer\go\pkg\mod`).
- `-analyze-deps`: Comma-separated list of dependencies to analyze (e.g., `bitbucket.org/ggwp1,bitbucket.org/ggwp2`).
- `-out`: Output file name for the generated code map (e.g., `full-codemap.json`).
- `-serve`: Starts a web server on the specified address to serve the results (e.g., `:8080`).

---

## Project Structure 🏗️

- `main.go` - Analyzer and web server
- `visualizer/` - React-based frontend for visualization
- `codemap.json` - Generated dependency map

---
## Screenshot 🖼️

### Sample Screenshot
![Sample Screenshot](https://github.com/chinmay-sawant/CodeMapper/blob/master/screenshot/image1.png)

### Full Screenshot
![Full Screenshot](https://github.com/chinmay-sawant/CodeMapper/blob/master/screenshot/image2.png)
### Visual Backtracking
![Visual Backtracking](https://github.com/chinmay-sawant/CodeMapper/blob/master/screenshot/image3.png)
### Path View  
![Path View](https://github.com/chinmay-sawant/CodeMapper/blob/master/screenshot/image4.png)
### Front Tracking to Find References
![Front Tracking to Find References](https://github.com/chinmay-sawant/CodeMapper/blob/master/screenshot/image5.png)

---
## Made with ❤️ in India
---
## License 📄

MIT