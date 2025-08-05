package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
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
	skipPatternsRaw := flag.String("skip", "", "Comma-separated list of path substrings to skip (e.g., 'ent,models,generated')") // <<< CHANGED
	flag.Parse()

	// <<< CHANGED: Process the skip patterns into a slice for easy use
	var skipPatterns []string
	if *skipPatternsRaw != "" {
		skipPatterns = strings.Split(*skipPatternsRaw, ",")
	}

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
		err := walkAndProcess(target, skipPatterns, findDefinitions) // <<< CHANGED
		if err != nil {
			log.Fatalf("Error during definition scan in %s: %v", target.FSRoot, err)
		}
	}

	log.Println("Pass 2: Finding all call sites...")
	for _, target := range analysisTargets {
		log.Printf("Scanning call sites in %s (%s)", target.ModulePath, target.FSRoot)
		err := walkAndProcess(target, skipPatterns, findCallSites) // <<< CHANGED
		if err != nil {
			log.Fatalf("Error during call site scan in %s: %v", target.FSRoot, err)
		}
	}

	// --- 4. Serialize and Output Results ---
	var finalMappings []Mapping
	// <<< CHANGED: Filter out mappings that have no call sites.
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
		log.Fatalf("Error writing to %s: %v", err)
	}
	log.Printf("Successfully created mapping file: %s", *outputFile)

	if *serveAddr != "" {
		serveVisualization(*serveAddr, *outputFile, *visualizerDir)
	}
}

// <<< CHANGED: Function signature updated to accept skipPatterns
// walkAndProcess abstracts the file walking logic for a given analysis target.
func walkAndProcess(target AnalysisTarget, skipPatterns []string, processor func(filePath string, target AnalysisTarget)) error {
	return filepath.WalkDir(target.FSRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// <<< CHANGED: Check if the path should be skipped based on user-provided patterns.
		for _, pattern := range skipPatterns {
			// Ensure we don't match on empty strings from the split
			if pattern != "" && strings.Contains(path, pattern) {
				log.Printf("Skipping path due to skip pattern '%s': %s", pattern, path)
				// If it's a directory, skip the whole directory.
				if d.IsDir() {
					return filepath.SkipDir
				}
				// If it's a file, just skip this file.
				return nil
			}
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
				break
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
			typeExpr := fn.Recv.List[0].Type
			buf := new(bytes.Buffer)
			if err := printer.Fprint(buf, fileSet, typeExpr); err != nil {
				log.Printf("Warning: could not print receiver type for %s in %s: %v", funcName, filePath, err)
				return true
			}
			receiverType := buf.String()
			def.ID = fmt.Sprintf("%s.%s.%s", fullPkgPath, receiverType, funcName)
		} else {
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

	if fn, ok := n.(*ast.FuncDecl); ok {
		var callerID string
		if fn.Recv != nil && len(fn.Recv.List) > 0 {
			typeExpr := fn.Recv.List[0].Type
			buf := new(bytes.Buffer)
			if err := printer.Fprint(buf, v.fileSet, typeExpr); err != nil {
				log.Printf("Warning: could not print receiver type for %s in %s: %v", fn.Name.Name, v.target.FSRoot, err)
				callerID = fmt.Sprintf("%s.<?>%s", v.currentPkg, fn.Name.Name)
			} else {
				callerID = fmt.Sprintf("%s.%s.%s", v.currentPkg, buf.String(), fn.Name.Name)
			}
		} else {
			callerID = fmt.Sprintf("%s.%s", v.currentPkg, fn.Name.Name)
		}
		v.callerIDStack = append(v.callerIDStack, callerID)

		if fn.Body != nil {
			ast.Walk(v, fn.Body)
		}

		v.callerIDStack = v.callerIDStack[:len(v.callerIDStack)-1]
		return nil
	}

	if call, ok := n.(*ast.CallExpr); ok {
		if len(v.callerIDStack) > 0 {
			calleeID := v.resolveCalleeID(call.Fun)
			if m, found := mappings[calleeID]; found {
				relPath, _ := filepath.Rel(v.target.FSRoot, v.fileSet.Position(call.Pos()).Filename)
				m.CallSites = append(m.CallSites, CallSite{
					FilePath: filepath.ToSlash(relPath),
					Line:     v.fileSet.Position(call.Pos()).Line,
					CallerID: v.callerIDStack[len(v.callerIDStack)-1],
				})
			}
		}
	}

	return v
}

// resolveCalleeID determines the unique ID of the function being called.
func (v *callSiteVisitor) resolveCalleeID(fun ast.Expr) string {
	switch f := fun.(type) {
	case *ast.SelectorExpr:
		if pkgIdent, ok := f.X.(*ast.Ident); ok {
			if fullPkgPath, found := v.importMap[pkgIdent.Name]; found {
				return fmt.Sprintf("%s.%s", fullPkgPath, f.Sel.Name)
			}
		}
	case *ast.Ident:
		return fmt.Sprintf("%s.%s", v.currentPkg, f.Name)
	}
	return ""
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
			if imp.Name.Name == "_" {
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
