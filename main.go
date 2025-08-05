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
	"os/exec"
	"path/filepath"
	"strings"

	"golang.org/x/mod/modfile"
	"golang.org/x/mod/module"
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

// AnalysisTarget holds the filesystem path and module path for a codebase to be analyzed.
type AnalysisTarget struct {
	FSRoot     string // The absolute path on the filesystem
	ModulePath string // The Go module path (e.g., "github.com/my/project")
}

var (
	definitions = make(map[string]Definition)
	mappings    = make(map[string]*Mapping)
	fileSet     = token.NewFileSet()
)

func main() {
	// --- 1. Flags and Configuration ---
	targetPath := flag.String("path", ".", "Path to the Go application to analyze")
	outputFile := flag.String("out", "codemap.json", "Output JSON file name")
	serveAddr := flag.String("serve", "", "If set, serves visualization on this address (e.g., ':8080')")
	visualizerDir := flag.String("viz-dir", "./visualizer", "Path to the visualizer's static files (html, css, js)")
	goModCache := flag.String("gopath", "", "Path to Go's module cache (GOMODCACHE). If empty, will try to auto-detect.")
	analyzeDeps := flag.String("analyze-deps", "", "Comma-separated list of external dependency prefixes to analyze (e.g., 'bitbucket/ggwp,github.com/gin-gonic/gin')")
	flag.Parse()

	if *goModCache == "" {
		cmd := exec.Command("go", "env", "GOMODCACHE")
		out, err := cmd.Output()
		if err != nil {
			log.Fatalf("Could not auto-detect GOMODCACHE. Please specify it with the -gopath flag. Error: %v", err)
		}
		*goModCache = strings.TrimSpace(string(out))
		log.Printf("Auto-detected GOMODCACHE: %s", *goModCache)
	}

	mainModulePath, err := getModulePath(*targetPath)
	if err != nil {
		log.Fatalf("Error finding module path in %s: %v", *targetPath, err)
	}
	log.Printf("Analyzing main module: %s\n", mainModulePath)

	// --- 2. Identify all codebases to analyze (local project + dependencies) ---
	analysisTargets := []AnalysisTarget{{FSRoot: *targetPath, ModulePath: mainModulePath}}
	if *analyzeDeps != "" {
		depPrefixes := strings.Split(*analyzeDeps, ",")
		log.Printf("Finding specified dependencies to analyze: %v", depPrefixes)
		dependencyTargets, err := findDependencyPaths(*targetPath, *goModCache, depPrefixes)
		if err != nil {
			log.Fatalf("Could not resolve dependency paths: %v", err)
		}
		analysisTargets = append(analysisTargets, dependencyTargets...)
	}

	// --- 3. Run Analysis Passes ---
	log.Println("Pass 1: Finding all function definitions...")
	for _, target := range analysisTargets {
		log.Printf("Scanning definitions in %s (%s)", target.ModulePath, target.FSRoot)
		err := walkAndProcess(target, findDefinitions)
		if err != nil {
			log.Fatalf("Error during definition scan in %s: %v", target.FSRoot, err)
		}
	}

	log.Println("Pass 2: Finding all call sites...")
	for _, target := range analysisTargets {
		log.Printf("Scanning call sites in %s (%s)", target.ModulePath, target.FSRoot)
		err := walkAndProcess(target, findCallSites)
		if err != nil {
			log.Fatalf("Error during call site scan in %s: %v", target.FSRoot, err)
		}
	}

	// --- 4. Serialize and Output Results ---
	var finalMappings []Mapping
	for _, m := range mappings {
		// We can add a filter here if needed, but for now, let's include all found mappings.
		finalMappings = append(finalMappings, *m)
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

// walkAndProcess abstracts the file walking logic for a given analysis target.
func walkAndProcess(target AnalysisTarget, processor func(filePath string, target AnalysisTarget)) error {
	return filepath.WalkDir(target.FSRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(path, ".go") && !strings.HasSuffix(path, "_test.go") {
			processor(path, target)
		}
		return nil
	})
}

// getModulePath reads the module path from a go.mod file.
func getModulePath(targetDir string) (string, error) {
	goModPath := filepath.Join(targetDir, "go.mod")
	content, err := os.ReadFile(goModPath)
	if err != nil {
		return "", fmt.Errorf("could not read go.mod in '%s': %w", targetDir, err)
	}
	return modfile.ModulePath(content), nil
}

// findDependencyPaths parses the go.mod file to find the filesystem paths of specified dependencies.
func findDependencyPaths(projectRoot, goModCache string, depPrefixes []string) ([]AnalysisTarget, error) {
	var targets []AnalysisTarget
	goModPath := filepath.Join(projectRoot, "go.mod")
	content, err := os.ReadFile(goModPath)
	if err != nil {
		return nil, fmt.Errorf("could not read go.mod in '%s': %w", projectRoot, err)
	}

	modFile, err := modfile.Parse(goModPath, content, nil)
	if err != nil {
		return nil, fmt.Errorf("could not parse go.mod: %w", err)
	}

	for _, req := range modFile.Require {
		for _, prefix := range depPrefixes {
			trimmedPrefix := strings.TrimSpace(prefix)
			if strings.HasPrefix(req.Mod.Path, trimmedPrefix) {
				// Go encodes uppercase letters in module paths with '!' for the filesystem cache.
				escapedPath, err := module.EscapePath(req.Mod.Path)
				if err != nil {
					log.Printf("Warning: could not escape module path %s: %v", req.Mod.Path, err)
					continue
				}
				depPath := filepath.Join(goModCache, escapedPath+"@"+req.Mod.Version)
				if _, err := os.Stat(depPath); os.IsNotExist(err) {
					log.Printf("Warning: dependency path not found, skipping: %s", depPath)
					continue
				}
				log.Printf("Found matching dependency: %s version %s at %s", req.Mod.Path, req.Mod.Version, depPath)
				targets = append(targets, AnalysisTarget{
					FSRoot:     depPath,
					ModulePath: req.Mod.Path,
				})
				break // Move to the next requirement
			}
		}
	}
	return targets, nil
}

// findDefinitions scans a single file for function and method definitions.
func findDefinitions(filePath string, target AnalysisTarget) {
	node, err := parser.ParseFile(fileSet, filePath, nil, 0)
	if err != nil {
		log.Printf("Warning: Could not parse %s: %v\n", filePath, err)
		return
	}

	relPath, _ := filepath.Rel(target.FSRoot, filePath)
	pkgDir := filepath.Dir(relPath)
	if pkgDir == "." {
		pkgDir = ""
	}
	// Use filepath.Join for OS-agnostic path joining, then convert to slash for consistency in IDs.
	fullPkgPath := filepath.ToSlash(filepath.Join(target.ModulePath, pkgDir))

	ast.Inspect(node, func(n ast.Node) bool {
		fn, ok := n.(*ast.FuncDecl)
		if !ok {
			return true
		}

		funcName := fn.Name.Name
		def := Definition{
			Name:     funcName,
			FilePath: filepath.ToSlash(relPath),
			Line:     fileSet.Position(fn.Pos()).Line,
			Package:  fullPkgPath,
		}

		if fn.Recv != nil && len(fn.Recv.List) > 0 {
			// It's a method
			typeExpr := fn.Recv.List[0].Type
			buf := new(bytes.Buffer)
			// Using ast.Fprint to get the string representation of the receiver type
			ast.Fprint(buf, fileSet, typeExpr, nil)
			receiverType := buf.String()
			def.ID = fmt.Sprintf("%s.%s.%s", fullPkgPath, receiverType, funcName)
		} else {
			// It's a regular function
			def.ID = fmt.Sprintf("%s.%s", fullPkgPath, funcName)
		}

		definitions[def.ID] = def
		mappings[def.ID] = &Mapping{Definition: def, CallSites: []CallSite{}}
		return true
	})
}

// callSiteVisitor implements ast.Visitor to find function calls with accurate caller context.
type callSiteVisitor struct {
	fileSet       *token.FileSet
	target        AnalysisTarget
	importMap     map[string]string
	currentPkg    string
	callerIDStack []string
}

// Visit traverses the AST. It's the core of the improved call site analysis.
func (v *callSiteVisitor) Visit(n ast.Node) ast.Visitor {
	if n == nil {
		return nil
	}

	// --- Push to stack when entering a function ---
	if fn, ok := n.(*ast.FuncDecl); ok {
		var callerID string
		if fn.Recv != nil && len(fn.Recv.List) > 0 {
			typeExpr := fn.Recv.List[0].Type
			buf := new(bytes.Buffer)
			ast.Fprint(buf, v.fileSet, typeExpr, nil)
			callerID = fmt.Sprintf("%s.%s.%s", v.currentPkg, buf.String(), fn.Name.Name)
		} else {
			callerID = fmt.Sprintf("%s.%s", v.currentPkg, fn.Name.Name)
		}
		v.callerIDStack = append(v.callerIDStack, callerID)

		// Manually walk the function body so we can pop after it's done.
		if fn.Body != nil {
			ast.Walk(v, fn.Body)
		}

		// --- Pop from stack after leaving the function ---
		v.callerIDStack = v.callerIDStack[:len(v.callerIDStack)-1]
		return nil // We already walked the children, so don't continue.
	}

	// --- Identify a call site ---
	if call, ok := n.(*ast.CallExpr); ok {
		// Only process if we are inside a function
		if len(v.callerIDStack) > 0 {
			calleeID := v.resolveCalleeID(call.Fun)
			if m, found := mappings[calleeID]; found {
				relPath, _ := filepath.Rel(v.target.FSRoot, v.fileSet.Position(call.Pos()).Filename)
				m.CallSites = append(m.CallSites, CallSite{
					FilePath: filepath.ToSlash(relPath),
					Line:     v.fileSet.Position(call.Pos()).Line,
					CallerID: v.callerIDStack[len(v.callerIDStack)-1], // Get current caller from top of stack
				})
			}
		}
	}

	return v // Continue walking
}

// resolveCalleeID determines the unique ID of the function being called.
func (v *callSiteVisitor) resolveCalleeID(fun ast.Expr) string {
	switch f := fun.(type) {
	case *ast.SelectorExpr: // e.g., "fmt.Println" or "myVar.Method"
		// Check if it's a package selector first
		if pkgIdent, ok := f.X.(*ast.Ident); ok {
			if fullPkgPath, found := v.importMap[pkgIdent.Name]; found {
				// It's a call to an imported package, e.g., `pkg.Func()`
				return fmt.Sprintf("%s.%s", fullPkgPath, f.Sel.Name)
			}
		}
		// If not a known package, it could be a method call on a variable.
		// This part is complex to resolve statically without full type checking.
		// For now, we focus on package-level functions and methods which cover many cases.
		// A full implementation would require `go/types`.

	case *ast.Ident: // e.g., "myFunction" (a call within the same package)
		return fmt.Sprintf("%s.%s", v.currentPkg, f.Name)
	}
	return "" // Could not resolve
}

// findCallSites prepares and runs the callSiteVisitor on a file.
func findCallSites(filePath string, target AnalysisTarget) {
	node, err := parser.ParseFile(fileSet, filePath, nil, 0)
	if err != nil {
		log.Printf("Warning: Could not parse %s: %v\n", filePath, err)
		return
	}

	relPath, _ := filepath.Rel(target.FSRoot, filePath)
	pkgDir := filepath.Dir(relPath)
	if pkgDir == "." {
		pkgDir = ""
	}
	currentFullPkgPath := filepath.ToSlash(filepath.Join(target.ModulePath, pkgDir))

	importMap := make(map[string]string)
	for _, imp := range node.Imports {
		path := strings.Trim(imp.Path.Value, `"`)
		if imp.Name != nil {
			if imp.Name.Name == "_" { // blank identifier
				continue
			}
			importMap[imp.Name.Name] = path
		} else {
			parts := strings.Split(path, "/")
			importMap[parts[len(parts)-1]] = path
		}
	}

	visitor := &callSiteVisitor{
		fileSet:       fileSet,
		target:        target,
		importMap:     importMap,
		currentPkg:    currentFullPkgPath,
		callerIDStack: []string{},
	}
	ast.Walk(visitor, node)
}

// serveVisualization starts a web server to display the results.
func serveVisualization(addr, jsonFile, vizDir string) {
	log.Printf("Starting visualization server at http://localhost%s", addr)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/codemap", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		http.ServeFile(w, r, jsonFile)
	})
	fs := http.FileServer(http.Dir(vizDir))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".css") {
			w.Header().Set("Content-Type", "text/css")
		} else if strings.HasSuffix(r.URL.Path, ".js") || strings.HasSuffix(r.URL.Path, ".mjs") {
			w.Header().Set("Content-Type", "application/javascript")
		}
		fs.ServeHTTP(w, r)
	}))
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
