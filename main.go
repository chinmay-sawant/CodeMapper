package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Definition represents a declared function, method, or constructor.
type Definition struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Package  string `json:"package"`
	FilePath string `json:"filePath"`
	Line     int    `json:"line"`
}

// CallSite represents where a Definition is called/used.
type CallSite struct {
	FilePath string `json:"filePath"`
	Line     int    `json:"line"`
	CallerID string `json:"callerId"`
}

// Mapping links a single Definition to all the places it's called.
type Mapping struct {
	Definition Definition `json:"definition"`
	CallSites  []CallSite `json:"callSites"`
}

var (
	definitions = make(map[string]Definition)
	mappings    = make(map[string]*Mapping)
	fileSet     = token.NewFileSet()
)

func main() {
	targetPath := flag.String("path", ".", "Path to the Go application to analyze")
	outputFile := flag.String("out", "codemap.json", "Output JSON file name")
	serveAddr := flag.String("serve", "", "If set, serves visualization on this address (e.g., ':8080')")
	visualizerDir := flag.String("viz-dir", "./visualizer", "Path to the visualizer's static files (html, css, js)")
	flag.Parse()

	modulePath, err := getModulePath(*targetPath)
	if err != nil {
		log.Fatalf("Error finding module path in %s: %v", *targetPath, err)
	}
	log.Printf("Analyzing module: %s\n", modulePath)

	log.Println("Pass 1: Finding all function definitions...")
	err = filepath.WalkDir(*targetPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(path, ".go") && !strings.HasSuffix(path, "_test.go") {
			findDefinitions(path, *targetPath, modulePath)
		}
		return nil
	})
	if err != nil {
		log.Fatalf("Error during definition scan: %v", err)
	}

	log.Println("Pass 2: Finding all call sites...")
	err = filepath.WalkDir(*targetPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(path, ".go") && !strings.HasSuffix(path, "_test.go") {
			findCallSites(path, *targetPath, modulePath)
		}
		return nil
	})
	if err != nil {
		log.Fatalf("Error during call site scan: %v", err)
	}

	var finalMappings []Mapping
	for _, m := range mappings {
		if len(m.CallSites) > 0 {
			finalMappings = append(finalMappings, *m)
		}
	}

	jsonData, err := json.MarshalIndent(finalMappings, "", "  ")
	if err != nil {
		log.Fatalf("Error marshalling JSON: %v", err)
	}

	err = os.WriteFile(*outputFile, jsonData, 0644)
	if err != nil {
		log.Fatalf("Error writing to %s: %v", *outputFile, err)
	}
	log.Printf("Successfully created mapping file: %s", *outputFile)

	if *serveAddr != "" {
		serveVisualization(*serveAddr, *outputFile, *visualizerDir)
	}
}

func getModulePath(targetDir string) (string, error) {
	goModPath := filepath.Join(targetDir, "go.mod")
	content, err := os.ReadFile(goModPath)
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(content), "\n") {
		if strings.HasPrefix(line, "module") {
			parts := strings.Fields(line)
			if len(parts) == 2 {
				return parts[1], nil
			}
		}
	}
	return "", fmt.Errorf("could not find module declaration in go.mod")
}

func findDefinitions(filePath, rootPath, modulePath string) {
	node, err := parser.ParseFile(fileSet, filePath, nil, 0)
	if err != nil {
		log.Printf("Warning: Could not parse %s: %v\n", filePath, err)
		return
	}
	relativePath, _ := filepath.Rel(rootPath, filePath)
	pkgDir := filepath.Dir(relativePath)
	if pkgDir == "." {
		pkgDir = ""
	}
	fullPkgPath := filepath.ToSlash(filepath.Join(modulePath, pkgDir))
	ast.Inspect(node, func(n ast.Node) bool {
		fn, ok := n.(*ast.FuncDecl)
		if !ok {
			return true
		}
		funcName := fn.Name.Name
		def := Definition{
			Name:     funcName,
			FilePath: filepath.ToSlash(relativePath),
			Line:     fileSet.Position(fn.Pos()).Line,
			Package:  fullPkgPath,
		}
		if fn.Recv != nil && len(fn.Recv.List) > 0 {
			expr := fn.Recv.List[0].Type
			buf := new(bytes.Buffer)
			ast.Fprint(buf, fileSet, expr, nil)
			def.ID = fmt.Sprintf("%s.%s", fullPkgPath, buf.String()+"."+funcName)
		} else {
			def.ID = fmt.Sprintf("%s.%s", fullPkgPath, funcName)
		}
		definitions[def.ID] = def
		mappings[def.ID] = &Mapping{Definition: def, CallSites: []CallSite{}}
		return true
	})
}

func findCallSites(filePath, rootPath, modulePath string) {
	node, err := parser.ParseFile(fileSet, filePath, nil, 0)
	if err != nil {
		log.Printf("Warning: Could not parse %s: %v\n", filePath, err)
		return
	}
	relativePath, _ := filepath.Rel(rootPath, filePath)
	currentPkgDir := filepath.Dir(relativePath)
	if currentPkgDir == "." {
		currentPkgDir = ""
	}
	currentFullPkgPath := filepath.ToSlash(filepath.Join(modulePath, currentPkgDir))
	importMap := make(map[string]string)
	for _, imp := range node.Imports {
		path := strings.Trim(imp.Path.Value, `"`)
		if imp.Name != nil {
			importMap[imp.Name.Name] = path
		} else {
			parts := strings.Split(path, "/")
			importMap[parts[len(parts)-1]] = path
		}
	}
	var currentCallerID string
	ast.Inspect(node, func(n ast.Node) bool {
		if fn, ok := n.(*ast.FuncDecl); ok {
			if fn.Recv != nil && len(fn.Recv.List) > 0 {
				expr := fn.Recv.List[0].Type
				buf := new(bytes.Buffer)
				ast.Fprint(buf, fileSet, expr, nil)
				currentCallerID = fmt.Sprintf("%s.%s", currentFullPkgPath, buf.String()+"."+fn.Name.Name)
			} else {
				currentCallerID = fmt.Sprintf("%s.%s", currentFullPkgPath, fn.Name.Name)
			}
		}
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		var calleeID string
		switch fun := call.Fun.(type) {
		case *ast.SelectorExpr:
			pkgIdent, ok := fun.X.(*ast.Ident)
			if !ok {
				return true
			}
			pkgAlias := pkgIdent.Name
			funcName := fun.Sel.Name
			if fullPkgPath, found := importMap[pkgAlias]; found {
				calleeID = fmt.Sprintf("%s.%s", fullPkgPath, funcName)
			}
		case *ast.Ident:
			funcName := fun.Name
			calleeID = fmt.Sprintf("%s.%s", currentFullPkgPath, funcName)
		}
		if m, found := mappings[calleeID]; found {
			if currentCallerID != "" {
				m.CallSites = append(m.CallSites, CallSite{
					FilePath: filepath.ToSlash(relativePath),
					Line:     fileSet.Position(call.Pos()).Line,
					CallerID: currentCallerID,
				})
			}
		}
		if _, ok := n.(*ast.FuncDecl); ok {
			defer func() { currentCallerID = "" }()
		}
		return true
	})
}

// serveVisualization starts a web server with a custom handler to force correct MIME types.
func serveVisualization(addr, jsonFile, vizDir string) {
	log.Printf("Starting visualization server at http://localhost%s", addr)

	// Create a new ServeMux (a request router).
	mux := http.NewServeMux()

	// API endpoint to serve the generated JSON data.
	mux.HandleFunc("/api/codemap", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		http.ServeFile(w, r, jsonFile)
	})

	// Create a file server for our static assets.
	fs := http.FileServer(http.Dir(vizDir))

	// Wrap the file server with our custom MIME type handler.
	// This now handles all other requests (like for CSS and JS).
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// **THE FIX IS HERE:** Manually set the Content-Type header based on the file extension.
		if strings.HasSuffix(r.URL.Path, ".css") {
			w.Header().Set("Content-Type", "text/css")
		} else if strings.HasSuffix(r.URL.Path, ".js") {
			w.Header().Set("Content-Type", "application/javascript")
		} else if strings.HasSuffix(r.URL.Path, ".mjs") {
			w.Header().Set("Content-Type", "application/javascript")
		} else if strings.HasSuffix(r.URL.Path, ".json") {
			w.Header().Set("Content-Type", "application/json")
		}
		// Let the standard file server do the rest of the work.
		fs.ServeHTTP(w, r)
	}))

	// Start the server using our custom router.
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
