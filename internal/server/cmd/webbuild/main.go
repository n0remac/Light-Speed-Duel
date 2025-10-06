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

	base := wd
	if _, err := os.Stat(filepath.Join(base, "web")); err != nil {
		base = filepath.Join(base, "internal", "server")
	}

	builds := []struct {
		entry string
		out   string
	}{
		{filepath.Join(base, "web", "src", "main.ts"), filepath.Join(base, "web", "client.js")},
		{filepath.Join(base, "web", "src", "lobby.ts"), filepath.Join(base, "web", "lobby.js")},
	}

	for _, job := range builds {
		result := api.Build(api.BuildOptions{
			EntryPoints:   []string{job.entry},
			Outfile:       job.out,
			AbsWorkingDir: base,
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
				log.Printf("esbuild error (%s): %s", filepath.Base(job.entry), message.Text)
			}
			log.Fatalf("esbuild failed with %d error(s)", len(result.Errors))
		}
	}
}

