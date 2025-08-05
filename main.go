package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/token"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	// Import the key package for module-aware loading
	"golang.org/x/tools/go/packages"
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
	internalModules := flag.String("internal", "", "Comma-separated list of module prefixes to treat as internal (e.g., 'bitbucket.org/yourorg,github.com/yourorg')")

	// NEW FLAG to override GOPATH
	gopath := flag.String("gopath", "", "(Optional) Override the GOPATH to locate the module cache")

	flag.Parse()

	// SET THE GOPATH ENVIRONMENT VARIABLE IF THE FLAG IS USED
	// This tells the Go toolchain (and go/packages) where to find the `pkg/mod` directory.
	if *gopath != "" {
		log.Printf("Overriding GOPATH to: %s", *gopath)
		err := os.Setenv("GOPATH", *gopath)
		if err != nil {
			// This is unlikely to fail, but check for completeness.
			log.Fatalf("Failed to set GOPATH environment variable: %v", err)
		}
	}

	// 1. Define the patterns to load. We want all packages in the target path (`./...`)
	//    and all packages matching our internal prefixes.
	patterns := []string{"./..."}
	var internalPrefixes []string
	if *internalModules != "" {
		internalPrefixes = strings.Split(*internalModules, ",")
		for i, prefix := range internalPrefixes {
			trimmedPrefix := strings.TrimSpace(prefix)
			internalPrefixes[i] = trimmedPrefix
			// Add the internal module pattern to be loaded by go/packages
			patterns = append(patterns, trimmedPrefix+"/...")
		}
	}
	log.Printf("Loading packages with patterns: %v", patterns)

	// 2. Configure and run packages.Load. This is the core of the tool.
	//    It will find and parse all Go files for the specified patterns,
	//    honoring the GOPATH environment variable we may have just set.
	cfg := &packages.Config{
		Mode: packages.NeedName | packages.NeedFiles | packages.NeedSyntax | packages.NeedModule | packages.NeedImports,
		Dir:  *targetPath, // Run the load command from the target application's directory
		Fset: fileSet,
	}
	pkgs, err := packages.Load(cfg, patterns...)
	if err != nil {
		log.Fatalf("Error loading packages: %v", err)
	}
	if packages.PrintErrors(pkgs) > 0 {
		log.Fatalf("Errors during package loading. Check if dependencies are tidy.")
	}

	// We need the absolute path of the root module to make file paths relative later.
	var rootDir string
	var mainModulePath string
	for _, pkg := range pkgs {
		if pkg.Module != nil && pkg.Module.Main {
			rootDir = pkg.Module.Dir
			mainModulePath = pkg.Module.Path
			log.Printf("Analyzing module: %s rooted at %s", mainModulePath, rootDir)
			break
		}
	}
	if rootDir == "" {
		log.Fatal("Could not determine root module directory. Make sure you are running this in a Go module.")
	}

	// Pass 1: Find all function definitions in all loaded packages.
	log.Println("Pass 1: Finding all function definitions...")
	for _, pkg := range pkgs {
		// We only want to find definitions in our main module or designated internal modules.
		if pkg.Module != nil && (pkg.Module.Path == mainModulePath || isInternalModule(pkg.PkgPath, internalPrefixes)) {
			findDefinitions(pkg, rootDir)
		}
	}

	// Pass 2: Find all call sites in all loaded packages.
	log.Println("Pass 2: Finding all call sites...")
	for _, pkg := range pkgs {
		if pkg.Module != nil && (pkg.Module.Path == mainModulePath || isInternalModule(pkg.PkgPath, internalPrefixes)) {
			findCallSites(pkg, rootDir)
		}
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

// findDefinitions takes a `*packages.Package` and finds all function/method declarations.
func findDefinitions(pkg *packages.Package, rootDir string) {
	for _, fileNode := range pkg.Syntax {
		filePath := fileSet.File(fileNode.Pos()).Name()
		// Make file path relative to the main module's root for consistency
		relativePath, err := filepath.Rel(rootDir, filePath)
		if err != nil {
			// If it's from the mod cache, the relative path might fail. Fallback to the full path.
			// A better approach would be to make it relative to the module's own root.
			relativePath = filePath
		}

		ast.Inspect(fileNode, func(n ast.Node) bool {
			fn, ok := n.(*ast.FuncDecl)
			if !ok {
				return true
			}
			funcName := fn.Name.Name
			def := Definition{
				Name:     funcName,
				FilePath: filepath.ToSlash(relativePath),
				Line:     fileSet.Position(fn.Pos()).Line,
				Package:  pkg.PkgPath, // Use the package's canonical import path
			}
			if fn.Recv != nil && len(fn.Recv.List) > 0 {
				// This is a method. Construct the ID as "package.Receiver.MethodName"
				expr := fn.Recv.List[0].Type
				buf := new(bytes.Buffer)
				ast.Fprint(buf, fileSet, expr, nil)
				def.ID = fmt.Sprintf("%s.%s", pkg.PkgPath, buf.String()+"."+funcName)
			} else {
				// This is a regular function. Construct the ID as "package.FunctionName"
				def.ID = fmt.Sprintf("%s.%s", pkg.PkgPath, funcName)
			}
			definitions[def.ID] = def
			mappings[def.ID] = &Mapping{Definition: def, CallSites: []CallSite{}}
			return true
		})
	}
}

// isInternalModule checks if a given package path matches any of the user-provided internal prefixes.
func isInternalModule(pkgPath string, internalPrefixes []string) bool {
	for _, prefix := range internalPrefixes {
		if strings.HasPrefix(pkgPath, prefix) {
			return true
		}
	}
	return false
}

// findCallSites takes a `*packages.Package` and finds all calls to functions we've indexed.
func findCallSites(pkg *packages.Package, rootDir string) {
	currentFullPkgPath := pkg.PkgPath

	for _, fileNode := range pkg.Syntax {
		filePath := fileSet.File(fileNode.Pos()).Name()
		relativePath, err := filepath.Rel(rootDir, filePath)
		if err != nil {
			relativePath = filePath
		}

		// Build import map for the current file
		importMap := make(map[string]string)
		for _, impSpec := range fileNode.Imports {
			path := strings.Trim(impSpec.Path.Value, `"`)
			if impSpec.Name != nil {
				importMap[impSpec.Name.Name] = path // Explicit alias (e.g., `i "image"`)
			} else {
				// Infer name from path (e.g., "net/http" -> "http")
				importMap[filepath.Base(path)] = path
			}
		}

		var currentCallerID string
		ast.Inspect(fileNode, func(n ast.Node) bool {
			// Find the surrounding function to identify the caller
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
			case *ast.SelectorExpr: // e.g., `somepkg.SomeFunc()`
				pkgIdent, ok := fun.X.(*ast.Ident)
				if !ok {
					// Could be a more complex expression, e.g. a function call returning a struct.
					// A more robust solution would use the `go/types` package for type information.
					return true
				}
				pkgAlias := pkgIdent.Name
				funcName := fun.Sel.Name
				if fullPkgPath, found := importMap[pkgAlias]; found {
					calleeID = fmt.Sprintf("%s.%s", fullPkgPath, funcName)
				}
			case *ast.Ident: // e.g., `SomeFunc()`
				funcName := fun.Name
				// Call to a function in the current package
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

			// Reset caller ID after we leave the function scope using defer
			if _, ok := n.(*ast.FuncDecl); ok {
				defer func() { currentCallerID = "" }()
			}
			return true
		})
	}
}

// serveVisualization starts a web server with a custom handler to force correct MIME types.
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
		} else if strings.HasSuffix(r.URL.Path, ".js") {
			w.Header().Set("Content-Type", "application/javascript")
		} else if strings.HasSuffix(r.URL.Path, ".mjs") {
			w.Header().Set("Content-Type", "application/javascript")
		} else if strings.HasSuffix(r.URL.Path, ".json") {
			w.Header().Set("Content-Type", "application/json")
		}
		fs.ServeHTTP(w, r)
	}))
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
