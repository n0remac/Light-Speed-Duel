# Protocol Buffers Guide

## Quick Start

### Generate Proto Files (Required Before Running)

```bash
make proto
```

This generates both Go and TypeScript protobuf code from `proto/ws_messages.proto`.

### Individual Generation

```bash
# Generate only Go code
make proto-go

# Generate only TypeScript code
make proto-ts
```

### Clean Generated Files

```bash
make clean-proto
```

## When to Regenerate

You **must** regenerate proto files:
- After cloning the repository (first time setup)
- After pulling changes that modify `proto/ws_messages.proto`
- After modifying `proto/ws_messages.proto` yourself

## Build Process

### Full Build

```bash
# 1. Generate proto files
make proto

# 2. Build TypeScript
go generate ./internal/server

# 3. Build Go binary
go build -o LightSpeedDuel

# 4. Run
./LightSpeedDuel -addr :8080
```

### Quick Build Script

```bash
./restart-dev.sh
```

This script does all the steps automatically.

## Troubleshooting

### Error: "envelope.toBinary is not a function"

**Cause**: Proto files weren't generated before building TypeScript.

**Solution**:
```bash
make proto
go generate ./internal/server
go build
```

### Error: "cannot find package LightSpeedDuel/internal/proto/ws"

**Cause**: Go proto files weren't generated.

**Solution**:
```bash
make proto-go
go build
```

### Error: "Cannot find module './proto/proto/ws_messages_pb'"

**Cause**: TypeScript proto files weren't generated.

**Solution**:
```bash
make proto-ts
go generate ./internal/server
go build
```

## Development Workflow

When editing `.proto` files:

1. **Edit** `proto/ws_messages.proto`
2. **Regenerate**: `make proto`
3. **Rebuild TypeScript**: `go generate ./internal/server`
4. **Rebuild Go**: `go build`
5. **Test**: `./LightSpeedDuel`

## Dependencies

### Required Tools

- `protoc` (Protocol Buffers compiler) - Already installed
- `protoc-gen-go` - Installed via: `go install google.golang.org/protobuf/cmd/protoc-gen-go@latest`
- `@bufbuild/protoc-gen-es` - Installed in `internal/server/web/node_modules`

### NPM Packages

Located in `internal/server/web/`:
- `@bufbuild/protobuf` - Runtime library
- `@bufbuild/protoc-gen-es` - Code generator

## File Locations

```
proto/
└── ws_messages.proto              # Source schema

internal/proto/ws/
└── ws_messages.pb.go              # Generated Go code

internal/server/web/src/proto/proto/
└── ws_messages_pb.ts              # Generated TypeScript code
```

## CI/CD Integration

Add to your build pipeline:

```yaml
steps:
  - name: Install dependencies
    run: |
      go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
      cd internal/server/web && npm install

  - name: Generate proto files
    run: make proto

  - name: Build application
    run: |
      go generate ./internal/server
      go build -o LightSpeedDuel
```

## Common Issues

### "protoc-gen-go: program not found"

Ensure Go's bin directory is in PATH:
```bash
export PATH=$PATH:$(go env GOPATH)/bin
```

Or run with explicit PATH:
```bash
PATH="$PATH:$(go env GOPATH)/bin" make proto
```

### "protoc-gen-es: not found"

Install npm dependencies:
```bash
cd internal/server/web
npm install
```

## Schema Changes

When modifying the protocol:

1. **Never remove fields** - Mark as deprecated instead
2. **Never reuse field numbers** - Use new numbers for new fields
3. **Use optional for nullable fields** - `optional Type field = N;`
4. **Document breaking changes** - Update CHANGELOG

Example of backward-compatible change:
```protobuf
message Ghost {
  string id = 1;
  double x = 2;
  double y = 3;
  // NEW: Added in v2.0
  optional string team = 4;
}
```

## Performance

Proto generation is fast:
- Go generation: ~50ms
- TypeScript generation: ~100ms
- Total: **~150ms**

Run `make proto` liberally during development.
