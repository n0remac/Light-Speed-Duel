package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/evanw/esbuild/pkg/api"
)

func main() {
	wd, err := os.Getwd()
	if err != nil {
		log.Fatalf("getwd: %v", err)
	}

	entry := filepath.Join(wd, "web", "src", "main.ts")
	out := filepath.Join(wd, "web", "client.js")

	result := api.Build(api.BuildOptions{
		EntryPoints:   []string{entry},
		Outfile:       out,
		AbsWorkingDir: wd,
		Bundle:        true,
		Format:        api.FormatIIFE,
		Target:        api.ES2018,
		Platform:      api.PlatformBrowser,
		LogLevel:      api.LogLevelInfo,
		Sourcemap:     api.SourceMapInline,
		Write:         true,
		Loader: map[string]api.Loader{
			".ts": api.LoaderTS,
		},
	})
	if len(result.Errors) > 0 {
		for _, message := range result.Errors {
			log.Printf("esbuild error: %s", message.Text)
		}
		log.Fatalf("esbuild failed with %d error(s)", len(result.Errors))
	}
}
